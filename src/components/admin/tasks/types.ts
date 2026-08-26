export type TaskStatus = "pending" | "in_progress" | "done";
export type TaskColor = "blue" | "green" | "purple" | "orange" | "pink" | "red";

export interface AdminTask {
  id: number;
  admin_id: number;
  assigned_to: number | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  status: TaskStatus;
  color: TaskColor;
  created_at: string;
  updated_at: string;
  admin_first_name: string;
  admin_last_name: string;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
}

export interface AdminAccount {
  id: number;
  first_name: string;
  last_name: string;
}
