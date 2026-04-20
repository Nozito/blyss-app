import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useLocation } from "react-router-dom";
import { Bell, X, CheckCircle, AlertCircle, AlertTriangle, Clock, MessageSquare, CreditCard, Gift, Mail, CheckCheck } from "lucide-react";
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
    showNotifications: boolean;
    setShowNotifications: (show: boolean) => void;
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
    const [showNotifications, setShowNotifications] = useState(false);

    const unreadCount = useMemo(
        () => notifications.filter((n) => !n.is_read).length,
        [notifications]
    );
    const [isConnected, setIsConnected] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (showNotifications) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [showNotifications]);

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

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return "maintenant";
        if (diffMins < 60) return `il y a ${diffMins} min`;
        if (diffHours < 24) return `il y a ${diffHours}h`;
        if (diffDays === 1) return "hier";
        if (diffDays < 7) return `il y a ${diffDays}j`;

        return date.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
        });
    };

    const unreadNotifications = notifications.filter((n) => !n.is_read);
    const readNotifications = notifications.filter((n) => n.is_read);

    const hiddenRoutes = [
        "/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/legal",
        "/admin",
        "/onboarding",
        "/pro/subscription",
        "/pro/subscription-settings",
        "/pro/subscription-payment",
        "/pro/subscription-success",
        "/pro/help",
        "/pro/notifications",
        "/pro/payments",
        "/pro/settings",
        "/pro/public-profile",
        "/client/settings",
        "/client/payment-methods",
        "/client/notifications",
        "/client/help",
    ];

    const location = useLocation();
    const currentPath = location.pathname;

    const shouldShowBell = !!user &&
        !hiddenRoutes.includes(currentPath) &&
        !currentPath.startsWith("/client/specialist/") &&
        !currentPath.startsWith("/client/booking-detail/") &&
        !currentPath.startsWith("/client/booking/");

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                unreadCount,
                showNotifications,
                setShowNotifications,
                markAsRead,
                markAllAsRead,
                isConnected,
            }}
        >
            {children}

            {/* Toasts - uniquement sur les pages hors auth */}
            {user && !hiddenRoutes.includes(currentPath) && (
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

            {/* Bell panel - triggered from bottom nav */}
            {shouldShowBell && (
                <>
                    <AnimatePresence>
                        {showNotifications && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="fixed inset-0 bg-black/30 backdrop-blur-md z-[55]"
                                    onClick={() => setShowNotifications(false)}
                                />

                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{
                                        type: "spring",
                                        damping: 30,
                                        stiffness: 400,
                                        mass: 0.8
                                    }}
                                    className="fixed inset-x-4 bg-white/98 backdrop-blur-xl rounded-[28px] overflow-hidden z-[60] flex flex-col"
                                    style={{
                                        top: 'max(env(safe-area-inset-top, 16px) + 72px, 72px)',
                                        maxHeight: notifications.length === 0
                                            ? '280px'
                                            : 'calc(100vh - max(env(safe-area-inset-top, 16px) + 88px, 88px) - max(env(safe-area-inset-bottom, 16px) + 16px, 16px))',
                                        maxWidth: '420px',
                                        margin: '0 auto',
                                        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25), 0 0 1px rgba(0, 0, 0, 0.1)"
                                    }}
                                >
                                    {/* Reste du panel identique ... */}
                                    {/* Je garde seulement le code principal ici pour la clarté */}
                                    <div className="bg-white/60 backdrop-blur-xl border-b border-gray-200/50 px-5 py-4 flex-shrink-0">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center">
                                                    <Bell size={17} className="text-white" strokeWidth={2.5} />
                                                </div>
                                                <div>
                                                    <h2 className="text-[17px] font-semibold text-gray-900 tracking-tight">
                                                        Notifications
                                                    </h2>
                                                    <p className="text-[12px] text-gray-500 font-medium">
                                                        {unreadCount > 0
                                                            ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
                                                            : "Tout est lu"
                                                        }
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => setShowNotifications(false)}
                                                className="w-8 h-8 rounded-full bg-gray-100/80 hover:bg-gray-200/80 flex items-center justify-center transition-all active:scale-90"
                                            >
                                                <X size={16} className="text-gray-600" strokeWidth={2.5} />
                                            </button>
                                        </div>

                                        {unreadCount > 0 && (
                                            <button
                                                onClick={markAllAsRead}
                                                className="w-full h-11 rounded-full bg-gradient-to-r from-primary to-pink-500 text-white text-[15px] font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 active:scale-98"
                                                style={{
                                                    boxShadow: "0 4px 16px rgba(139, 92, 246, 0.3)"
                                                }}
                                            >
                                                <CheckCheck size={18} strokeWidth={2.5} />
                                                Tout marquer comme lu
                                            </button>
                                        )}
                                    </div>

                                    <div
                                        className="flex-1 overflow-y-auto px-4 py-3"
                                        style={{
                                            WebkitOverflowScrolling: 'touch',
                                            scrollbarWidth: 'none',
                                            msOverflowStyle: 'none'
                                        }}
                                    >
                                        {notifications.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-16 h-16 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                                                    <Bell size={28} className="text-gray-400" strokeWidth={2} />
                                                </div>
                                                <p className="text-[15px] font-semibold text-gray-900 mb-1">Aucune notification</p>
                                                <p className="text-[13px] text-gray-600">Tes notifications apparaîtront ici</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {unreadNotifications.length > 0 && (
                                                    <>
                                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1 pb-1">Non lues</p>
                                                        {unreadNotifications.map((notif) => {
                                                            const config = notificationConfig[notif.type] || notificationConfig.default;
                                                            const Icon = config.icon;
                                                            return (
                                                                <div
                                                                    key={notif.id}
                                                                    onClick={() => markAsRead(notif.id)}
                                                                    className="flex items-start gap-3 p-3 rounded-2xl bg-primary/5 border border-primary/10 cursor-pointer active:scale-[0.98] transition-transform"
                                                                >
                                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.bg }}>
                                                                        <Icon size={16} style={{ color: config.color }} strokeWidth={2.5} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[14px] font-semibold text-gray-900 leading-tight">{notif.title}</p>
                                                                        <p className="text-[12px] text-gray-600 mt-0.5 leading-snug line-clamp-2">{notif.message}</p>
                                                                        <p className="text-[11px] text-gray-400 mt-1 font-medium">{formatDate(notif.created_at)}</p>
                                                                    </div>
                                                                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}
                                                {readNotifications.length > 0 && (
                                                    <>
                                                        {unreadNotifications.length > 0 && (
                                                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1 pt-2 pb-1">Lues</p>
                                                        )}
                                                        {readNotifications.map((notif) => {
                                                            const config = notificationConfig[notif.type] || notificationConfig.default;
                                                            const Icon = config.icon;
                                                            return (
                                                                <div
                                                                    key={notif.id}
                                                                    className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 cursor-default"
                                                                >
                                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 opacity-60" style={{ backgroundColor: config.bg }}>
                                                                        <Icon size={16} style={{ color: config.color }} strokeWidth={2.5} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[14px] font-medium text-gray-600 leading-tight">{notif.title}</p>
                                                                        <p className="text-[12px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{notif.message}</p>
                                                                        <p className="text-[11px] text-gray-300 mt-1 font-medium">{formatDate(notif.created_at)}</p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </>
            )}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error("useNotifications must be used within NotificationProvider");
    return context;
};