/* ================================================================
   FlowBridge · Defaults & Palettes
   -----------------------------------------------------------------
   NO demo/fake data — everything starts EMPTY. The user builds
   their own portals, categories and flows from scratch.
   ================================================================ */

/* ---------- Flow direction types (fully customisable per flow) ---------- */
export const FLOW_DIRS = {
  forward:      { dir: 'forward',      icon: '➡', name: 'اعتيادي',   nameEn: 'Forward',      color: '#38BDF8', desc: 'البيانات تتدفق من المصدر إلى الهدف' },
  reverse:      { dir: 'reverse',      icon: '⬅', name: 'عكسي',      nameEn: 'Reverse',      color: '#8B5CF6', desc: 'البيانات تتدفق من الهدف إلى المصدر' },
  bidirectional:{ dir: 'bidirectional',icon: '⇄', name: 'ثنائي',     nameEn: 'Bidirectional',color: '#F59E0B', desc: 'تدفق البيانات في الاتجاهين' }
};

/* ---------- Builder palettes (design options — not data) ---------- */
export const PORTAL_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#F59E0B', '#10B981', '#14B8A6', '#38BDF8', '#3B82F6', '#84CC16', '#F97316', '#A3E635'];

export const FLOW_COLORS = ['#38BDF8', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#F43F5E', '#14B8A6', '#3B82F6', '#A3E635'];

export const PORTAL_EMOJIS = ['🛒', '📦', '🧮', '💳', '👥', '🎯', '🏦', '🚚', '🏭', '🗄️', '📊', '🛠️', '📨', '🔔', '🤖', '📑', '💾', '🖥️', '☁️', '📱', '🛰️', '⚙️', '🧾', '🏷️', '💡', '🌐', '🔐', '📡', '🧪', '🚀', '🛫', '🏪', '💠', '🧬', '🗽', '🪙', '💎', '🧭', '📎', '🧷', '🗃️', '🕘', '🌍'];

/* ---------- Portal categories (fully customisable by the user) ---------- */
export const DEFAULT_CATEGORIES = ['عام'];

export const CATEGORIES = DEFAULT_CATEGORIES;   // legacy alias

/* ---------- EMPTY seeds — no demo data anywhere ---------- */
export const SEED_PORTALS = [];                       // user adds their own portals
export const SEED_GRAPH = { nodes: [], flows: [] };   // empty canvas at start
export const SEED_SETTINGS = {
  autosave: true,
  apiUrl: '',
  apiToken: '',
  categories: DEFAULT_CATEGORIES
};
