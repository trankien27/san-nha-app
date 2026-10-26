// Kiểu dữ liệu khớp với API backend Be.Clean (JSON camelCase, enum dạng chuỗi camelCase).

export type AppRole = 'ADMIN' | 'ORGANIZER' | 'TREASURER' | 'PLAYER'

export interface UserSession {
  id: string
  email: string
  displayName: string
  roles: AppRole[]
  mustChangePassword: boolean
}

export interface AuthEnvelope {
  accessToken: string
  accessTokenExpiresAtUtc: string
  user: UserSession
}

export interface PagedResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export type PlaySessionStatus = 'draft' | 'open' | 'full' | 'completed' | 'costClosed' | 'cancelled'

export interface PlaySessionCourt {
  id: string
  courtId: string
  code: string
  name: string
  startsAtUtc: string
  endsAtUtc: string
}

export interface PlaySession {
  id: string
  code: string
  title: string
  venueName: string
  venueAddress: string
  venueMapUrl: string | null
  startsAtUtc: string
  endsAtUtc: string
  maxParticipants: number
  registrationDeadlineUtc: string
  organizerName: string
  notes: string | null
  status: PlaySessionStatus
  cancellationReason: string | null
  courts: PlaySessionCourt[]
  registeredCount: number
  waitlistedCount: number
  remainingSlots: number
  participantCount: number
  /** Tổng tiền cần thu khi đã chốt (đã trừ miễn thu); null khi chưa chốt. */
  amountDue: number | null
  collectedAmount: number
  playerCount: number
  courtCount: number
}

export interface Dashboard {
  activePlayers: number
  upcomingSessions: number
  upcomingRegistrations: number
  lowStockItems: number
  costsThisMonth: number
  outstandingReceivables: number
  paymentsThisMonth: number
  nextSessions: PlaySession[]
}

export interface DashboardAction { id: string; title: string; description: string; path: string; count: number }

export type AttendanceStatus = 'pending' | 'present' | 'absentExcused' | 'absentUnexcused' | 'guest'
export interface Attendance { id: string; playerId: string | null; name: string; status: AttendanceStatus; isChargeable: boolean; updatedAtUtc: string; skillRating: number | null }
export interface AttendanceInput { playerId: string | null; guestName: string | null; status: AttendanceStatus; isChargeable: boolean; skillRating?: number | null }

export interface Player {
  id: string
  memberCode: string
  fullName: string
  status: 'active' | 'paused' | 'left'
  skillRating: number | null
  effectiveSkillRating: number
}

export type SessionGameStatus = 'planned' | 'finished' | 'cancelled'
export interface GamePlayer {
  attendanceId: string
  playerId: string | null
  name: string
  isGuest: boolean
  skillRating: number
  gamesPlayed: number
  wins: number
  losses: number
  isPlaying: boolean
  courtNo: number | null
}
export interface GameSlot { attendanceId: string; name: string; skillRating: number }
export interface SessionGame {
  id: string
  roundNo: number
  courtNo: number
  teamA: GameSlot[]
  teamB: GameSlot[]
  scoreA: number | null
  scoreB: number | null
  status: SessionGameStatus
  startedAtUtc: string
  finishedAtUtc: string | null
  durationMinutes: number | null
}
export interface SessionGameBoard { playSessionId: string; players: GamePlayer[]; games: SessionGame[]; nextRoundNo: number; suggestedCourtCount: number }
export interface GameDraft { courtNo: number; teamA: string[]; teamB: string[] }
export interface SuggestedRound { roundNo: number; games: GameDraft[]; benchAttendanceIds: string[] }

export interface ParticipantCharge { id: number; playerId: string | null; name: string; amount: number; isWaived: boolean; isExempt?: boolean }
export interface SessionDebt { chargeId: number; playerId: string | null; name: string; isGuest: boolean; amount: number; paidAmount: number; receivableId: string | null; paymentIds: string[] }
export interface CostLine { id: number; category: string; description: string; amount: number }
export interface SessionCost {
  id: string
  playSessionId: string
  sessionTitle: string
  version: number
  isClosed: boolean
  totalAmount: number
  closedAtUtc: string | null
  lines: CostLine[]
  charges: ParticipantCharge[]
  collectedAmount: number
  debts?: SessionDebt[] | null
  exemptAmount?: number
}

export interface Receivable { id: string; description: string; amount: number; paidAmount: number; outstandingAmount: number; status: string; createdAtUtc: string }
export interface PersonalAttendance { sessionId: string; sessionCode: string; sessionTitle: string; startsAtUtc: string; status: AttendanceStatus }
export interface PersonalReport { player: Player; outstanding: number; creditBalance: number; receivables: Receivable[]; recentAttendance: PersonalAttendance[] }

export type RegistrationStatus = 'registered' | 'waitlisted' | 'cancelled' | 'promoted'
export interface RegistrationView { id: string; playerId: string; playerName: string; status: RegistrationStatus; waitlistPosition: number | null; isCurrentUser: boolean }
export interface RegistrationRoster {
  playSessionId: string
  capacity: number
  registeredCount: number
  waitlistedCount: number
  remainingSlots: number
  registrationDeadlineUtc: string
  isAcceptingRegistrations: boolean
  currentUserRegistration: RegistrationView | null
  canCurrentUserRegister: boolean
  canCurrentUserCancel: boolean
  registered: RegistrationView[]
  waitlisted: RegistrationView[]
}
