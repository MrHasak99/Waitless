// Hand-written type definitions matching supabase/migrations/0001_init.sql.
// In a production setup, replace this with `supabase gen types typescript`.

export type UserRole = "diner" | "admin" | "venue_staff";

export type BookingStatus =
  | "pending_deposit"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no_show";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  disabled: boolean;
  no_show_count: number;
  total_bookings: number;
  created_at: string;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string | null;
  description: string | null;
  address: string;
  area: string | null;
  lat: number;
  lng: number;
  cover_image: string | null;
  phone: string | null;
  opens_at: string;
  closes_at: string;
  deposit_threshold: number;
  deposit_kwd: number;
  merge_fee_kwd: number;
  borrow_seat_fee_kwd: number;
  deleted_at: string | null;
  created_at: string;
};

export type RestaurantTable = {
  id: string;
  restaurant_id: string;
  label: string;
  seats: number;
  x: number;
  y: number;
  is_mergeable: boolean;
  can_lend_seats: boolean;
  max_lendable_seats: number;
  adjacent_table_ids: string[];
  created_at: string;
};

export type TimeSlot = {
  id: string;
  restaurant_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  created_at: string;
};

export type Booking = {
  id: string;
  user_id: string;
  restaurant_id: string;
  slot_id: string;
  table_id: string | null;
  party_size: number;
  status: BookingStatus;
  risk_score: number | null;
  deposit_required: boolean;
  deposit_paid_at: string | null;
  reminder_sent_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type WaitlistEntry = {
  id: string;
  slot_id: string;
  user_id: string;
  party_size: number;
  position: number;
  notified_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  created_at: string;
};
