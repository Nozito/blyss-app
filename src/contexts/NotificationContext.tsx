import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useLocation } from "react-router-dom";
import { Bell, X, CheckCircle, AlertCircle, AlertTriangle, Clock, MessageSquare, CreditCard, Gift, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3001";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const refreshAuthToken = async (): Promise<boolean> => {
    try {
        // The refresh_token cookie is sent automatically by the browser
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        if (response.ok) {
            return true;
        }

        return false;
    } catch (error) {
        console.error('❌ Erreur refresh token:', error);
        return false;
    }
};

interface Notification {
    id: number;
    user_id: number;
    type: string;
    title: string;
    message: string;
    data: any;
    is_read: boolean;
    created_at: string;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: number) => void;
    markAllAsRead: () => void;
    isConnected: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const notificationConfig: { [key: string]: { icon: any; color: string; bg: string } } = {
    new_booking: { icon: CheckCircle, color: "#34C759", bg: "rgba(52, 199, 89, 0.12)" },
    booking_confirmed: { icon: CheckCircle, color: "#007AFF", bg: "rgba(0, 122, 255, 0.12)" },
    booking_cancelled: { icon: AlertCircle, color: "#FF3B30", bg: "rgba(255, 59, 48, 0.12)" },
    booking_reminder: { icon: Clock, color: "#FF9500", bg: "rgba(255, 149, 0, 0.12)" },
    message_received: { icon: MessageSquare, color: "#5856D6", bg: "rgba(88, 86, 214, 0.12)" },
    payment_received: { icon: CreditCard, color: "#34C759", bg: "rgba(52, 199, 89, 0.12)" },
    promotional: { icon: Gift, color: "#FF2D55", bg: "rgba(255, 45, 85, 0.12)" },
    late_alert: { icon: AlertTriangle, color: "#FF9500", bg: "rgba(255, 149, 0, 0.12)" },
    email_summary: { icon: Mail, color: "#8E8E93", bg: "rgba(142, 142, 147, 0.12)" },
    default: { icon: Bell, color: "#8E8E93", bg: "rgba(142, 142, 147, 0.12)" },
};

const MAX_TOASTS = 3;

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [activeToasts, setActiveToasts] = useState<Notification[]>([]);

    const unreadCount = useMemo(
        () => notifications.filter((n) => !n.is_read).length,
        [notifications]
    );
    const [isConnected, setIsConnected] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!user) return;

        let isUnmounted = false;

        const connectWebSocket = async () => {
            // Cookie is sent automatically with the WebSocket upgrade request
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                // Backend authenticates via the access_token cookie from the upgrade headers.
                // No need to send token in a message.
            };

            ws.onmessage = async (event) => {
                try {
                    const message = JSON.parse(event.data);

                    if (message.type === "auth_error") {
                        ws.close();

                        await new Promise(resolve => setTimeout(resolve, 500));

                        const refreshed = await refreshAuthToken();

                        if (refreshed) {
                            if (!isUnmounted) {
                                connectWebSocket();
                            }
                        } else {
                            window.location.href = '/login';
                        }
                        return;
                    }

                    switch (message.type) {
                        case "auth_success":
                            break;

                        case "notifications":
                            setNotifications(message.data);
                            break;

                        case "new_notification":
                            const newNotif = message.data;
                            setNotifications((prev) => [newNotif, ...prev]);

                            if (navigator.vibrate) {
                                navigator.vibrate(10);
                            }

                            setActiveToasts((prev) => {
                                const updated = [newNotif, ...prev].slice(0, MAX_TOASTS);
                                return updated;
                            });

                            setTimeout(() => {
                                setActiveToasts((prev) => prev.filter((t) => t.id !== newNotif.id));
                            }, getDuration(newNotif.type));
                            break;

                        case "mark_read_success":
                            break;

                        case "mark_all_read_success":
                            break;
                    }
                } catch (error) {
                    console.error("❌ Erreur parsing WebSocket:", error);
                }
            };

            ws.onerror = (error) => {
                console.error('❌ WebSocket erreur:', error);
                setIsConnected(false);
            };

            ws.onclose = () => {
                setIsConnected(false);

                if (!isUnmounted) {
                    if (reconnectTimeoutRef.current) {
                        clearTimeout(reconnectTimeoutRef.current);
                    }

                    reconnectTimeoutRef.current = setTimeout(() => {
                        connectWebSocket();
                    }, 3000);
                }
            };
        };

        connectWebSocket();

        return () => {
            isUnmounted = true;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [user]);

    const getDuration = (type: string) => {
        const durations: { [key: string]: number } = {
            new_booking: 5000,
            booking_confirmed: 4000,
            booking_cancelled: 6000,
            booking_reminder: 5000,
            message_received: 4000,
            payment_received: 4000,
            promotional: 5000,
            late_alert: 6000,
            default: 4000,
        };
        return durations[type] || durations.default;
    };

    const markAsRead = (id: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (navigator.vibrate) {
                navigator.vibrate(5);
            }

            wsRef.current.send(JSON.stringify({ type: "mark_read", data: { notificationId: id } }));
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
        }
    };

    const markAllAsRead = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            if (navigator.vibrate) {
                navigator.vibrate(10);
            }

            wsRef.current.send(JSON.stringify({ type: "mark_all_read" }));
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        }
    };

    const dismissToast = (id: number) => {
        setActiveToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const AUTH_PATHS = new Set(["/", "/login", "/signup", "/forgot-password", "/reset-password", "/legal"]);
    const location = useLocation();
    const showToasts = !!user && !AUTH_PATHS.has(location.pathname);

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                unreadCount,
                markAsRead,
                markAllAsRead,
                isConnected,
            }}
        >
            {children}

            {/* Toasts temps réel */}
            {showToasts && (
                <div
                    className="fixed left-0 right-0 z-[100] flex flex-col pointer-events-none px-4"
                    style={{
                        top: 'env(safe-area-inset-top, 0px)',
                        paddingTop: '12px'
                    }}
                >
                    <AnimatePresence mode="popLayout">
                        {activeToasts.map((notif) => {
                            const config = notificationConfig[notif.type] || notificationConfig.default;
                            const Icon = config.icon;

                            return (
                                <motion.div
                                    key={notif.id}
                                    layout
                                    initial={{ y: -120, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -120, opacity: 0 }}
                                    transition={{
                                        type: "spring",
                                        damping: 30,
                                        stiffness: 400,
                                        mass: 0.8
                                    }}
                                    drag="y"
                                    dragConstraints={{ top: 0, bottom: 0 }}
                                    dragElastic={0.3}
                                    onDragEnd={(_, info) => {
                                        if (info.offset.y < -30 || info.velocity.y < -100) {
                                            dismissToast(notif.id);
                                        }
                                    }}
                                    className="mb-2 pointer-events-auto"
                                    style={{ touchAction: "pan-y" }}
                                >
                                    <div
                                        className="bg-white/95 backdrop-blur-xl rounded-[20px] shadow-lg border border-black/5 overflow-hidden"
                                        style={{
                                            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)"
                                        }}
                                    >
                                        <motion.div
                                            className="h-1 bg-gradient-to-r from-primary to-pink-500"
                                            initial={{ scaleX: 1 }}
                                            animate={{ scaleX: 0 }}
                                            transition={{ duration: getDuration(notif.type) / 1000, ease: "linear" }}
                                            style={{ transformOrigin: "left" }}
                                        />

                                        <div className="p-4 flex items-start gap-3">
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: config.bg }}
                                            >
                                                <Icon size={18} style={{ color: config.color }} strokeWidth={2.5} />
                                            </div>

                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <p className="font-semibold text-[15px] text-gray-900 mb-0.5 leading-tight tracking-tight">
                                                    {notif.title}
                                                </p>
                                                <p className="text-[13px] text-gray-600 leading-[1.4] line-clamp-2">
                                                    {notif.message}
                                                </p>
                                                <p className="text-[11px] text-gray-400 mt-1 font-medium">
                                                    {formatDate(notif.created_at)}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => dismissToast(notif.id)}
                                                className="w-7 h-7 rounded-full bg-gray-100/80 hover:bg-gray-200/80 flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                                            >
                                                <X size={13} className="text-gray-600" strokeWidth={3} />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error("useNotifications must be used within NotificationProvider");
    return context;
};