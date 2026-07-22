import type { ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Database,
  Flame,
  GraduationCap,
  Heart,
  Library,
  ListFilter,
  Menu,
  Monitor,
  Moon,
  Palette,
  Settings,
  Shapes,
  Sparkles,
  Sun,
  X,
} from "lucide-react";

type NavigationItem = { key: string; label: string; icon: typeof Flame };
type NavigationGroup = { label: string; items: NavigationItem[] };

export const navigationGroups: NavigationGroup[] = [
  {
    label: "发现",
    items: [
      { key: "selected", label: "精选", icon: Flame },
      { key: "all", label: "全部动态", icon: ListFilter },
      { key: "reports", label: "报告", icon: Database },
    ],
  },
  {
    label: "专题",
    items: [
      { key: "topic-models", label: "模型", icon: Shapes },
      { key: "topic-agents", label: "Agent", icon: Bot },
      { key: "topic-opensource", label: "开源", icon: Library },
      { key: "topic-education", label: "AI 教育", icon: GraduationCap },
      { key: "topic-culture", label: "AI 文化", icon: Palette },
    ],
  },
  {
    label: "工作台",
    items: [
      { key: "reading", label: "稍后读", icon: BookOpen },
      { key: "ask", label: "问白泽", icon: Sparkles },
    ],
  },
  {
    label: "服务",
    items: [
      { key: "agent", label: "Agent 接入", icon: Monitor },
      { key: "about", label: "关于", icon: Heart },
    ],
  },
];

type AppShellProps = {
  mode: string;
  readerOpen: boolean;
  mobileMenuOpen: boolean;
  themeMode: string;
  themeControl: ReactNode;
  children: ReactNode;
  onModeChange: (mode: string) => void;
  onMobileMenuChange: (open: boolean) => void;
  onThemeCycle: () => void;
};

export function AppShell({
  mode,
  readerOpen,
  mobileMenuOpen,
  themeMode,
  themeControl,
  children,
  onModeChange,
  onMobileMenuChange,
  onThemeCycle,
}: AppShellProps) {
  const selectMode = (nextMode: string) => {
    onModeChange(nextMode);
    onMobileMenuChange(false);
  };
  const mobileItems = navigationGroups[0].items.slice(0, 3).concat(navigationGroups[2].items.slice(0, 1));

  return (
    <main className={`app editorial-shell ${readerOpen ? "reader-open" : ""}`}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="mobile-topbar">
        <button className="mobile-menu-button" type="button" onClick={() => onMobileMenuChange(true)} aria-label="打开导航" aria-expanded={mobileMenuOpen}>
          <Menu size={22} />
        </button>
        <button className="mobile-wordmark" type="button" onClick={() => selectMode("selected")}>
          AI <span>BAIZE</span>
        </button>
        <button className="mobile-theme-button" type="button" onClick={onThemeCycle} aria-label="切换显示模式">
          {themeMode === "light" ? <Sun size={18} /> : themeMode === "auto" ? <Monitor size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <button className={`mobile-drawer-scrim ${mobileMenuOpen ? "open" : ""}`} type="button" aria-label="关闭导航" onClick={() => onMobileMenuChange(false)} />
      <aside className={`sidebar editorial-sidebar ${mobileMenuOpen ? "open" : ""}`} aria-label="主导航">
        <button className="drawer-close" type="button" onClick={() => onMobileMenuChange(false)} aria-label="关闭导航">
          <X size={22} />
        </button>
        <button className="brand" type="button" onClick={() => selectMode("selected")} aria-label="返回精选">
          <span>AI</span><i /><b>BAIZE</b>
        </button>
        <nav className="side-nav grouped-nav">
          {navigationGroups.map((group) => (
            <section className="nav-group" key={group.label} aria-label={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button className={mode === item.key ? "active" : ""} key={item.key} type="button" onClick={() => selectMode(item.key)} aria-current={mode === item.key ? "page" : undefined}>
                    <Icon size={17} /><span>{item.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={`admin-nav ${mode === "admin" ? "active" : ""}`} type="button" onClick={() => selectMode("admin")}>
            <Settings size={17} /><span>后台</span>
          </button>
          {themeControl}
          <a className="icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">粤ICP备2026046158号-2</a>
        </div>
      </aside>
      <section className="main" id="main-content" tabIndex={-1}>{children}</section>
      <nav className="mobile-bottom-nav" aria-label="手机底部导航">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          return (
            <button className={mode === item.key ? "active" : ""} key={item.key} type="button" onClick={() => selectMode(item.key)} aria-current={mode === item.key ? "page" : undefined}>
              <Icon size={18} /><span>{item.label === "全部动态" ? "全部" : item.label === "稍后读" ? "稍后读" : item.label}</span>
            </button>
          );
        })}
        <button className={!mobileItems.some((item) => item.key === mode) ? "active" : ""} type="button" onClick={() => onMobileMenuChange(true)} aria-expanded={mobileMenuOpen}>
          <Menu size={18} /><span>更多</span>
        </button>
      </nav>
    </main>
  );
}
