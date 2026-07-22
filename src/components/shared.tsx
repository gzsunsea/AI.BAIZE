import { Monitor, Moon, Smartphone, Sun } from "lucide-react";

export function ThemeToggle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { key: "dark", icon: Moon, label: "暗色" },
    { key: "auto", icon: Monitor, label: "跟随系统" },
    { key: "light", icon: Sun, label: "亮色" },
  ];
  return (
    <div className="theme-switch" aria-label="配色方案">
      {options.map((item) => {
        const Icon = item.icon;
        return <button className={value === item.key ? "active" : ""} key={item.key} type="button" onClick={() => onChange(item.key)} title={item.label}><Icon size={18} /></button>;
      })}
    </div>
  );
}

export function BookmarkGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="bookmark-modal" role="dialog" aria-modal="true" aria-label="收藏 AI.BAIZE" onClick={(event) => event.stopPropagation()}>
        <div className="bookmark-modal-head"><Smartphone size={20} /><strong>收藏 AI.BAIZE</strong></div>
        <p>链接已复制。不同浏览器出于安全限制，不能由网页直接写入书签；你可以按下面方式添加。</p>
        <div className="bookmark-steps">
          <span>iPhone Safari：点击底部分享按钮，然后选择“添加到主屏幕”。</span>
          <span>Android Chrome：点击浏览器菜单，选择“安装应用”或“添加到主屏幕”。</span>
          <span>桌面浏览器：按 <b>⌘D</b> 或 <b>Ctrl+D</b> 加入书签。</span>
        </div>
        <button className="primary" type="button" onClick={onClose}>知道了</button>
      </section>
    </div>
  );
}
