export interface News {
  id: number;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  body: string;
  is_pinned: number;
  published_at: string;
}

export interface Group {
  id: number;
  name: string;
  slug: string;
  birth_years: string | null;
  sort_order: number;
  is_schedule_only: number;
  photo: string | null;
}

export interface Player {
  id: number;
  name: string;
  slug: string;
  birth_date: string | null;
  position: string | null;
  club: string | null;
  bio: string | null;
  photo: string | null;
  is_graduate: number;
  is_featured: number;
  is_chudo_master: number;
  sort_order: number;
  number?: number | null;
}

export interface Video {
  id: number;
  title: string;
  youtube_url: string;
  sort_order: number;
  published_at: string;
}

export interface ScheduleMonth {
  id: number;
  year: number;
  month: number;
  title: string | null;
}

export interface ScheduleEntry {
  id: number;
  month_id: number;
  day: number;
  weekday: string | null;
  group_id: number;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  note: string | null;
  group_name?: string;
}

export interface ArchiveYear {
  id: number;
  year: number;
  type: 'archive' | 'gallery';
}

export interface ArchiveItem {
  id: number;
  year_id: number;
  title: string;
  slug: string;
  body: string | null;
  cover_image: string | null;
  sort_order: number;
}

export interface ArchivePhoto {
  id: number;
  item_id: number;
  filename: string;
  caption: string | null;
  sort_order: number;
}

export interface VizitkaSection {
  id: number;
  title: string;
  body: string;
  image: string | null;
  sort_order: number;
}

export interface VizitkaCoach {
  id: number;
  photo: string;
  role: string;
  name: string;
  bio: string;
  sort_order: number;
}

export interface SiteSettings {
  [key: string]: string;
}
