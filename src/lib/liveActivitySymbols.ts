import type { CategoryDef } from '@/store/libraryStore';
import type { Task } from '@/store/taskStore';
import { suggestIcons } from '@/lib/iconLibrary';

const LUCIDE_TO_SF_SYMBOL: Record<string, string> = {
  Activity: 'waveform.path.ecg',
  ActivitySquare: 'waveform.path.ecg',
  AlarmCheck: 'alarm',
  AlarmClock: 'alarm',
  AlarmClockCheck: 'alarm',
  AlarmClockMinus: 'alarm',
  AlarmClockOff: 'alarm.slash',
  AlarmClockPlus: 'alarm',
  AlarmSmoke: 'smoke',
  Archive: 'archivebox',
  Award: 'rosette',
  Baby: 'figure.and.child.holdinghands',
  Banknote: 'banknote',
  BarChart: 'chart.bar',
  Bed: 'bed.double',
  Bell: 'bell',
  BellDot: 'bell.badge',
  BellElectric: 'bell',
  BellMinus: 'bell.slash',
  BellOff: 'bell.slash',
  BellPlus: 'bell.badge',
  BellRing: 'bell.and.waves.left.and.right',
  Bike: 'bicycle',
  BookOpen: 'book',
  Bookmark: 'bookmark',
  Box: 'shippingbox',
  Boxes: 'shippingbox',
  BoxSelect: 'shippingbox',
  Briefcase: 'briefcase',
  Brush: 'paintbrush',
  Bug: 'ladybug',
  Building: 'building.2',
  Cake: 'birthday.cake',
  Calculator: 'function',
  Calendar: 'calendar',
  Camera: 'camera',
  Car: 'car',
  ChartLine: 'chart.line.uptrend.xyaxis',
  ChefHat: 'frying.pan',
  Clipboard: 'checklist',
  Clock: 'clock',
  Clock1: 'clock',
  Clock2: 'clock',
  Clock3: 'clock',
  Clock4: 'clock',
  Clock5: 'clock',
  Clock6: 'clock',
  Clock7: 'clock',
  Clock8: 'clock',
  Clock9: 'clock',
  Clock10: 'clock',
  Clock11: 'clock',
  Clock12: 'clock',
  ClockAlert: 'clock.badge.exclamationmark',
  ClockArrowDown: 'clock.arrow.circlepath',
  ClockArrowUp: 'clock.arrow.circlepath',
  Code: 'chevron.left.forwardslash.chevron.right',
  Coffee: 'cup.and.saucer',
  Compass: 'safari',
  Cpu: 'cpu',
  CreditCard: 'creditcard',
  Crown: 'crown',
  Database: 'externaldrive',
  Dollar: 'dollarsign.circle',
  Dumbbell: 'dumbbell',
  Feather: 'pencil.and.outline',
  Film: 'film',
  Flag: 'flag',
  Flame: 'flame',
  Flask: 'testtube.2',
  Folder: 'folder',
  Footprints: 'figure.walk',
  Gamepad: 'gamecontroller',
  Gauge: 'gauge.with.dots.needle.67percent',
  Graduation: 'graduationcap',
  Guitar: 'guitars',
  Hammer: 'hammer',
  Hand: 'hand.raised',
  Headphones: 'headphones',
  Heart: 'heart',
  HeartHandshake: 'heart',
  Home: 'house',
  Image: 'photo',
  Inbox: 'tray',
  Key: 'key',
  Languages: 'character.bubble',
  Laptop: 'laptopcomputer',
  Leaf: 'leaf',
  Library: 'books.vertical',
  Lightbulb: 'lightbulb',
  Link: 'link',
  Location: 'mappin',
  Mail: 'envelope',
  Megaphone: 'megaphone',
  MessageCircle: 'message',
  MessageSquare: 'text.bubble',
  Mic: 'mic',
  Monitor: 'display',
  Moon: 'moon',
  Music: 'music.note',
  Navigation: 'location.north',
  Notebook: 'note.text',
  NotebookPen: 'square.and.pencil',
  Package: 'shippingbox',
  Palette: 'paintpalette',
  Paperclip: 'paperclip',
  Pen: 'pencil',
  Pencil: 'pencil',
  Phone: 'phone',
  Plane: 'airplane',
  Plug: 'powerplug',
  Receipt: 'receipt',
  RefreshCw: 'arrow.clockwise',
  Rocket: 'paperplane',
  Route: 'point.topleft.down.curvedto.point.bottomright.up',
  Save: 'square.and.arrow.down',
  Scale: 'scale.3d',
  Scissors: 'scissors',
  Search: 'magnifyingglass',
  Send: 'paperplane',
  Settings: 'gearshape',
  Shield: 'shield',
  ShoppingCart: 'cart',
  Sparkles: 'sparkles',
  Star: 'star',
  StickyNote: 'note',
  Tag: 'tag',
  Target: 'target',
  Timer: 'timer',
  Trash2: 'trash',
  Trophy: 'trophy',
  Truck: 'truck.box',
  User: 'person',
  Users: 'person.2',
  Utensils: 'fork.knife',
  Wallet: 'wallet.pass',
  Watch: 'applewatch',
  Wrench: 'wrench',
  Zap: 'bolt',
};

function resolveCategoryIconName(categoryValue: string | null | undefined, categories: ReadonlyArray<CategoryDef>) {
  if (!categoryValue) return undefined;
  let value: string | null = categoryValue;
  while (value) {
    const category = categories.find((cat) => cat.value === value);
    if (category?.icon) return category.icon;
    const slash = value.lastIndexOf('/');
    value = slash > 0 ? value.slice(0, slash) : null;
  }
  return undefined;
}

export function resolveLiveActivitySymbolName(
  task: Pick<Task, 'icon' | 'category' | 'title'>,
  categories: ReadonlyArray<CategoryDef>
) {
  const iconName =
    resolvePriorityTitleIconName(task.title) ||
    task.icon ||
    resolveTitleIconName(task.title) ||
    resolveCategoryIconName(task.category, categories);
  if (!iconName) return 'timer';
  return LUCIDE_TO_SF_SYMBOL[iconName] || LUCIDE_TO_SF_SYMBOL[normalizeIconName(iconName)] || 'timer';
}

function resolvePriorityTitleIconName(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('live activit')) return 'Sparkles';
  if (lower.includes('remind') || lower.includes('notification') || lower.includes('alert')) return 'Bell';
  return undefined;
}

function resolveTitleIconName(title: string) {
  return suggestIcons(title, 1)[0]?.name;
}

function normalizeIconName(iconName: string) {
  return iconName
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
