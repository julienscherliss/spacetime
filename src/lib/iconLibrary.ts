import {
  Activity, AlarmClock, Apple, Archive, Award, Baby, Banknote, BarChart3, Beaker, Bed,
  Bell, Bike, BookOpen, Bookmark, Briefcase, Brush, Bug, Building2, Cake, Calculator,
  Calendar, Camera, Car, Carrot, ChartLine, Cherry, ChefHat, Cigarette, Clapperboard,
  ClipboardList, Cloud, Code2, Coffee, Compass, Cpu, CreditCard, Croissant, Crown,
  Database, DollarSign, Dog, Dumbbell, Egg, Feather, Film, Flag, Flame, FlaskConical,
  Flower2, Folder, Footprints, Gamepad2, Gauge, GraduationCap, Guitar, Hammer, Hand,
  Headphones, Heart, HeartHandshake, Home, IceCream, Image, Inbox, Key, Lamp, Languages,
  Laptop, Leaf, Library, Lightbulb, Link, MapPin, Mail, Martini, Megaphone, MessageCircle,
  Mic, Moon, Mountain, Music, Newspaper, Notebook, Package, Palette, PartyPopper, PawPrint,
  PenLine, PenTool, Phone, PiggyBank, Pill, Pin, Pizza, Plane, Plug, Printer, Puzzle,
  Receipt, Recycle, Rocket, Ruler, Scale, Scissors, ScrollText, Search, Settings, Share2,
  Shield, ShoppingBag, ShoppingCart, Shovel, Shrub, Smile, Sparkles, Sprout, Star, Sun,
  Sunrise, Sunset, Target, Tent, Terminal, Ticket, Timer, Train, TreePine, TrendingUp,
  Trophy, Truck, Tv, Umbrella, User, Users, Utensils, Video, Wallet, Wand2, Watch,
  Waves, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

interface IconEntry {
  name: string;
  Icon: LucideIcon;
  /** Lowercase keywords used by search + suggestions. Name itself is always included. */
  tags: string[];
}

/** Curated whitelist. Order matters for tie-breaking in suggestions. */
const ENTRIES: IconEntry[] = [
  { name: 'Activity', Icon: Activity, tags: ['pulse', 'health', 'heart', 'fitness'] },
  { name: 'AlarmClock', Icon: AlarmClock, tags: ['alarm', 'wake', 'time'] },
  { name: 'Apple', Icon: Apple, tags: ['fruit', 'food', 'snack'] },
  { name: 'Archive', Icon: Archive, tags: ['box', 'storage'] },
  { name: 'Award', Icon: Award, tags: ['medal', 'prize', 'win'] },
  { name: 'Baby', Icon: Baby, tags: ['child', 'kid', 'parent', 'family'] },
  { name: 'Banknote', Icon: Banknote, tags: ['money', 'cash', 'finance'] },
  { name: 'BarChart', Icon: BarChart3, tags: ['analytics', 'stats', 'metrics', 'chart'] },
  { name: 'Beaker', Icon: Beaker, tags: ['lab', 'science', 'experiment'] },
  { name: 'Bed', Icon: Bed, tags: ['sleep', 'rest', 'nap'] },
  { name: 'Bell', Icon: Bell, tags: ['alert', 'notification', 'reminder'] },
  { name: 'Bike', Icon: Bike, tags: ['cycle', 'ride', 'commute', 'sport'] },
  { name: 'BookOpen', Icon: BookOpen, tags: ['read', 'book', 'study', 'learn'] },
  { name: 'Bookmark', Icon: Bookmark, tags: ['save', 'mark'] },
  { name: 'Briefcase', Icon: Briefcase, tags: ['work', 'job', 'office', 'business'] },
  { name: 'Brush', Icon: Brush, tags: ['paint', 'art', 'design', 'draw'] },
  { name: 'Bug', Icon: Bug, tags: ['debug', 'issue', 'fix'] },
  { name: 'Building', Icon: Building2, tags: ['office', 'company', 'corporate'] },
  { name: 'Cake', Icon: Cake, tags: ['birthday', 'dessert', 'celebrate'] },
  { name: 'Calculator', Icon: Calculator, tags: ['math', 'finance', 'numbers'] },
  { name: 'Calendar', Icon: Calendar, tags: ['date', 'schedule', 'event'] },
  { name: 'Camera', Icon: Camera, tags: ['photo', 'picture', 'shoot'] },
  { name: 'Car', Icon: Car, tags: ['drive', 'vehicle', 'commute'] },
  { name: 'Carrot', Icon: Carrot, tags: ['veggie', 'food', 'cook'] },
  { name: 'ChartLine', Icon: ChartLine, tags: ['growth', 'trend', 'metric'] },
  { name: 'Cherry', Icon: Cherry, tags: ['fruit', 'snack'] },
  { name: 'ChefHat', Icon: ChefHat, tags: ['cook', 'kitchen', 'food', 'recipe'] },
  { name: 'Cigarette', Icon: Cigarette, tags: ['smoke', 'break'] },
  { name: 'Clapperboard', Icon: Clapperboard, tags: ['film', 'movie', 'video', 'shoot'] },
  { name: 'Clipboard', Icon: ClipboardList, tags: ['list', 'todo', 'task', 'checklist'] },
  { name: 'Cloud', Icon: Cloud, tags: ['weather', 'sync', 'storage'] },
  { name: 'Code', Icon: Code2, tags: ['dev', 'program', 'engineering', 'ship'] },
  { name: 'Coffee', Icon: Coffee, tags: ['drink', 'break', 'cafe', 'morning'] },
  { name: 'Compass', Icon: Compass, tags: ['navigate', 'direction', 'explore'] },
  { name: 'Cpu', Icon: Cpu, tags: ['computer', 'hardware', 'tech'] },
  { name: 'CreditCard', Icon: CreditCard, tags: ['pay', 'finance', 'card', 'bill'] },
  { name: 'Croissant', Icon: Croissant, tags: ['bakery', 'breakfast', 'food'] },
  { name: 'Crown', Icon: Crown, tags: ['premium', 'royal', 'priority'] },
  { name: 'Database', Icon: Database, tags: ['data', 'storage', 'sql'] },
  { name: 'Dollar', Icon: DollarSign, tags: ['money', 'finance', 'pay'] },
  { name: 'Dog', Icon: Dog, tags: ['pet', 'walk', 'animal'] },
  { name: 'Dumbbell', Icon: Dumbbell, tags: ['gym', 'workout', 'lift', 'fitness', 'strength'] },
  { name: 'Egg', Icon: Egg, tags: ['breakfast', 'cook', 'food'] },
  { name: 'Feather', Icon: Feather, tags: ['light', 'write', 'quill'] },
  { name: 'Film', Icon: Film, tags: ['movie', 'video', 'cinema', 'edit'] },
  { name: 'Flag', Icon: Flag, tags: ['goal', 'milestone', 'finish'] },
  { name: 'Flame', Icon: Flame, tags: ['streak', 'hot', 'fire', 'energy'] },
  { name: 'Flask', Icon: FlaskConical, tags: ['lab', 'science', 'chem'] },
  { name: 'Flower', Icon: Flower2, tags: ['garden', 'plant', 'nature'] },
  { name: 'Folder', Icon: Folder, tags: ['file', 'organize', 'project'] },
  { name: 'Footprints', Icon: Footprints, tags: ['walk', 'stroll', 'step', 'hike'] },
  { name: 'Gamepad', Icon: Gamepad2, tags: ['game', 'play', 'console'] },
  { name: 'Gauge', Icon: Gauge, tags: ['speed', 'meter', 'measure'] },
  { name: 'Graduation', Icon: GraduationCap, tags: ['school', 'study', 'learn', 'edu'] },
  { name: 'Guitar', Icon: Guitar, tags: ['music', 'practice', 'instrument'] },
  { name: 'Hammer', Icon: Hammer, tags: ['build', 'fix', 'tool', 'repair'] },
  { name: 'Hand', Icon: Hand, tags: ['wave', 'hello', 'stop'] },
  { name: 'Headphones', Icon: Headphones, tags: ['music', 'listen', 'audio', 'podcast'] },
  { name: 'Heart', Icon: Heart, tags: ['love', 'favorite', 'like'] },
  { name: 'HeartHandshake', Icon: HeartHandshake, tags: ['wedding', 'engage', 'anniversary', 'love', 'date'] },
  { name: 'Home', Icon: Home, tags: ['house', 'clean', 'laundry', 'chore'] },
  { name: 'IceCream', Icon: IceCream, tags: ['dessert', 'sweet', 'snack'] },
  { name: 'Image', Icon: Image, tags: ['photo', 'picture'] },
  { name: 'Inbox', Icon: Inbox, tags: ['mail', 'email', 'messages'] },
  { name: 'Key', Icon: Key, tags: ['unlock', 'access', 'auth'] },
  { name: 'Lamp', Icon: Lamp, tags: ['light', 'desk'] },
  { name: 'Languages', Icon: Languages, tags: ['translate', 'learn', 'language'] },
  { name: 'Laptop', Icon: Laptop, tags: ['computer', 'work', 'remote'] },
  { name: 'Leaf', Icon: Leaf, tags: ['nature', 'plant', 'eco'] },
  { name: 'Library', Icon: Library, tags: ['books', 'study', 'read'] },
  { name: 'Lightbulb', Icon: Lightbulb, tags: ['idea', 'brainstorm', 'think'] },
  { name: 'Link', Icon: Link, tags: ['url', 'connect'] },
  { name: 'Location', Icon: MapPin, tags: ['place', 'pin', 'travel'] },
  { name: 'Mail', Icon: Mail, tags: ['email', 'inbox', 'message'] },
  { name: 'Martini', Icon: Martini, tags: ['drink', 'bar', 'happy', 'cocktail'] },
  { name: 'Megaphone', Icon: Megaphone, tags: ['announce', 'marketing', 'promo'] },
  { name: 'Message', Icon: MessageCircle, tags: ['chat', 'talk', 'sms', 'text'] },
  { name: 'Mic', Icon: Mic, tags: ['record', 'voice', 'podcast', 'talk'] },
  { name: 'Moon', Icon: Moon, tags: ['night', 'sleep', 'dark'] },
  { name: 'Mountain', Icon: Mountain, tags: ['hike', 'outdoor', 'nature'] },
  { name: 'Music', Icon: Music, tags: ['song', 'audio', 'practice'] },
  { name: 'Newspaper', Icon: Newspaper, tags: ['news', 'read', 'press'] },
  { name: 'Notebook', Icon: Notebook, tags: ['journal', 'notes', 'write'] },
  { name: 'Package', Icon: Package, tags: ['ship', 'box', 'delivery'] },
  { name: 'Palette', Icon: Palette, tags: ['art', 'color', 'design'] },
  { name: 'Party', Icon: PartyPopper, tags: ['celebrate', 'event'] },
  { name: 'Paw', Icon: PawPrint, tags: ['pet', 'animal', 'vet'] },
  { name: 'Pen', Icon: PenLine, tags: ['write', 'draft', 'journal', 'note'] },
  { name: 'PenTool', Icon: PenTool, tags: ['design', 'sketch', 'vector'] },
  { name: 'Phone', Icon: Phone, tags: ['call', 'ring', 'mobile'] },
  { name: 'PiggyBank', Icon: PiggyBank, tags: ['save', 'money', 'budget'] },
  { name: 'Pill', Icon: Pill, tags: ['medicine', 'health', 'meds'] },
  { name: 'Pin', Icon: Pin, tags: ['mark', 'fix'] },
  { name: 'Pizza', Icon: Pizza, tags: ['food', 'dinner'] },
  { name: 'Plane', Icon: Plane, tags: ['travel', 'trip', 'flight', 'airport'] },
  { name: 'Plug', Icon: Plug, tags: ['power', 'charge', 'connect'] },
  { name: 'Printer', Icon: Printer, tags: ['print', 'paper'] },
  { name: 'Puzzle', Icon: Puzzle, tags: ['problem', 'solve', 'piece'] },
  { name: 'Receipt', Icon: Receipt, tags: ['bill', 'expense', 'invoice'] },
  { name: 'Recycle', Icon: Recycle, tags: ['eco', 'reuse'] },
  { name: 'Rocket', Icon: Rocket, tags: ['launch', 'ship', 'start', 'fast'] },
  { name: 'Ruler', Icon: Ruler, tags: ['measure', 'design'] },
  { name: 'Scale', Icon: Scale, tags: ['balance', 'law', 'weigh'] },
  { name: 'Scissors', Icon: Scissors, tags: ['cut', 'trim'] },
  { name: 'Scroll', Icon: ScrollText, tags: ['document', 'doc', 'note'] },
  { name: 'Search', Icon: Search, tags: ['find', 'research', 'look'] },
  { name: 'Settings', Icon: Settings, tags: ['config', 'options'] },
  { name: 'Share', Icon: Share2, tags: ['send', 'post'] },
  { name: 'Shield', Icon: Shield, tags: ['secure', 'safe', 'protect'] },
  { name: 'ShoppingBag', Icon: ShoppingBag, tags: ['shop', 'errand', 'buy'] },
  { name: 'ShoppingCart', Icon: ShoppingCart, tags: ['shop', 'errand', 'buy', 'grocery'] },
  { name: 'Shovel', Icon: Shovel, tags: ['dig', 'garden', 'work'] },
  { name: 'Shrub', Icon: Shrub, tags: ['garden', 'plant'] },
  { name: 'Smile', Icon: Smile, tags: ['happy', 'mood', 'face'] },
  { name: 'Sparkles', Icon: Sparkles, tags: ['idea', 'magic', 'create', 'brainstorm', 'new'] },
  { name: 'Sprout', Icon: Sprout, tags: ['grow', 'plant', 'start'] },
  { name: 'Star', Icon: Star, tags: ['favorite', 'rate'] },
  { name: 'Sun', Icon: Sun, tags: ['morning', 'bright', 'weather'] },
  { name: 'Sunrise', Icon: Sunrise, tags: ['morning', 'early', 'dawn'] },
  { name: 'Sunset', Icon: Sunset, tags: ['evening', 'dusk'] },
  { name: 'Target', Icon: Target, tags: ['goal', 'focus', 'aim'] },
  { name: 'Tent', Icon: Tent, tags: ['camp', 'outdoor'] },
  { name: 'Terminal', Icon: Terminal, tags: ['code', 'dev', 'cli', 'shell'] },
  { name: 'Ticket', Icon: Ticket, tags: ['event', 'show', 'concert'] },
  { name: 'Timer', Icon: Timer, tags: ['stopwatch', 'pomodoro', 'focus'] },
  { name: 'Train', Icon: Train, tags: ['commute', 'travel'] },
  { name: 'Tree', Icon: TreePine, tags: ['nature', 'outdoor', 'park'] },
  { name: 'Trending', Icon: TrendingUp, tags: ['growth', 'analytics', 'metric'] },
  { name: 'Trophy', Icon: Trophy, tags: ['win', 'award', 'goal'] },
  { name: 'Truck', Icon: Truck, tags: ['delivery', 'ship', 'move'] },
  { name: 'Tv', Icon: Tv, tags: ['watch', 'show', 'media'] },
  { name: 'Umbrella', Icon: Umbrella, tags: ['rain', 'weather'] },
  { name: 'User', Icon: User, tags: ['profile', 'person', 'account'] },
  { name: 'Users', Icon: Users, tags: ['meet', 'standup', 'sync', 'team', 'interview', 'meeting', 'group'] },
  { name: 'Utensils', Icon: Utensils, tags: ['lunch', 'dinner', 'breakfast', 'eat', 'food', 'meal'] },
  { name: 'Video', Icon: Video, tags: ['call', 'zoom', 'meeting', 'record'] },
  { name: 'Wallet', Icon: Wallet, tags: ['money', 'finance', 'budget'] },
  { name: 'Wand', Icon: Wand2, tags: ['magic', 'create', 'auto'] },
  { name: 'Watch', Icon: Watch, tags: ['time', 'wear'] },
  { name: 'Waves', Icon: Waves, tags: ['ocean', 'beach', 'flow'] },
  { name: 'Wrench', Icon: Wrench, tags: ['fix', 'repair', 'tool', 'maintenance'] },
  { name: 'Zap', Icon: Zap, tags: ['energy', 'fast', 'quick', 'action'] },
];

const BY_NAME = new Map<string, IconEntry>(ENTRIES.map(e => [e.name, e]));

export const ICON_LIBRARY: ReadonlyArray<IconEntry> = ENTRIES;

/** Lookup an icon component by stored name. Returns null when not found. */
export function getIconByName(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  return BY_NAME.get(name)?.Icon ?? null;
}

/** Free-text search across name + tags. Returns matching entries, max `limit`. */
export function searchIcons(query: string, limit = 200): IconEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ENTRIES.slice(0, limit);
  const out: IconEntry[] = [];
  for (const e of ENTRIES) {
    const haystack = `${e.name.toLowerCase()} ${e.tags.join(' ')}`;
    if (haystack.includes(q)) out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Suggest icons that fit the given freeform text (task title, tag label, etc.).
 * Returns up to `limit` entries ranked by token-overlap with names + tags.
 */
export function suggestIcons(text: string, limit = 6): IconEntry[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
  if (tokens.length === 0) return [];

  const scored: { entry: IconEntry; score: number }[] = [];
  for (const entry of ENTRIES) {
    const nameLower = entry.name.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      // Exact tag match is strongest
      if (entry.tags.includes(tok)) score += 5;
      // Substring match in any tag
      else if (entry.tags.some(tag => tag.includes(tok) || tok.includes(tag))) score += 3;
      // Name match
      if (nameLower === tok) score += 4;
      else if (nameLower.includes(tok)) score += 2;
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.entry);
}
