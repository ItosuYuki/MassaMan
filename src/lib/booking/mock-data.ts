/**
 * In-memory stand-in for the reservations feature's data store.
 *
 * The real PostgreSQL schema for this is designed in db/schema.sql, but this
 * app is a Tech Jam prototype and no real Postgres is provisioned yet (see
 * CLAUDE.md). This module seeds the same rooms/therapists as the mock-db
 * test accounts and keeps reservations in a process-local array — it resets
 * on server restart, which is fine for a prototype demo.
 */

export type Gender = "male" | "female";

export type Room = {
  id: string;
  name: string;
};

export type Therapist = {
  id: string;
  name: string;
  gender: Gender;
  specialty: string;
};

export type Reservation = {
  id: string;
  userEmployeeId: string;
  userName: string;
  therapistId: string;
  roomId: string;
  date: string; // ISO yyyy-mm-dd
  startMinutes: number; // minutes from midnight, 15-minute steps within business hours
  durationMinutes: number; // 5-45, step 5 (requested treatment length; +15min cleanup buffer is also blocked)
  note: string;
  autoAssigned: boolean;
  createdAt: number;
};

export type Review = {
  id: string;
  reservationId: string; // one review per reservation (matches db/schema.sql's UNIQUE reservation_id)
  rating: number; // 1-5
  comment: string;
  createdAt: number;
};

export const ROOMS: Room[] = [
  { id: "room-1", name: "第1マッサージ室" },
  { id: "room-2", name: "第2マッサージ室" },
];

export const THERAPISTS: Therapist[] = [
  { id: "T2001", name: "田中 仁", gender: "male", specialty: "肩こり・腰痛" },
  { id: "T2002", name: "木村 健", gender: "male", specialty: "スポーツ系" },
  { id: "T2003", name: "高橋 大輔", gender: "male", specialty: "全身リラックス" },
  { id: "T2004", name: "佐藤 香", gender: "female", specialty: "むくみ・冷え" },
];

type Store = { reservations: Reservation[]; reviews: Review[]; nextId: number; nextReviewId: number };

const globalForBookingStore = globalThis as unknown as { __bookingStore?: Store };

function seedReservations(): Reservation[] {
  const today = new Date();
  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return [
    // A couple of pre-existing bookings so the availability grid isn't all-empty on first load.
    {
      id: "seed-1",
      userEmployeeId: "E1002",
      userName: "山田 洋輔",
      therapistId: "T2001",
      roomId: "room-1",
      date: iso(today),
      startMinutes: 10 * 60,
      durationMinutes: 30,
      note: "",
      autoAssigned: true,
      createdAt: Date.now(),
    },
    {
      id: "seed-2",
      userEmployeeId: "E1003",
      userName: "高橋 直人",
      therapistId: "T2004",
      roomId: "room-2",
      date: iso(today),
      startMinutes: 17 * 60,
      durationMinutes: 45,
      note: "",
      autoAssigned: false,
      createdAt: Date.now(),
    },
    // Past treatments so the mypage history/review feature has something to show on first load
    // (one already reviewed, one not, to demo both states).
    {
      id: "seed-3",
      userEmployeeId: "E1001",
      userName: "佐々木 美咲",
      therapistId: "T2003",
      roomId: "room-1",
      date: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3)),
      startMinutes: 14 * 60,
      durationMinutes: 30,
      note: "",
      autoAssigned: true,
      createdAt: Date.now(),
    },
    {
      id: "seed-4",
      userEmployeeId: "E1001",
      userName: "佐々木 美咲",
      therapistId: "T2004",
      roomId: "room-2",
      date: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)),
      startMinutes: 11 * 60,
      durationMinutes: 45,
      note: "肩と首の張りが強いです",
      autoAssigned: false,
      createdAt: Date.now(),
    },
  ];
}

export function getStore(): Store {
  if (!globalForBookingStore.__bookingStore) {
    globalForBookingStore.__bookingStore = {
      reservations: seedReservations(),
      reviews: [],
      nextId: 1,
      nextReviewId: 1,
    };
  }
  return globalForBookingStore.__bookingStore;
}

export function nextReservationId(): string {
  const store = getStore();
  const id = `res-${store.nextId}`;
  store.nextId += 1;
  return id;
}

export function nextReviewId(): string {
  const store = getStore();
  const id = `review-${store.nextReviewId}`;
  store.nextReviewId += 1;
  return id;
}
