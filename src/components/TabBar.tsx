import { NavLink } from 'react-router-dom';
import { Bookmark, CheckCircle2, Compass, Home, Sparkles } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Tonight', icon: Home },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark },
  { to: '/watched', label: 'Watched', icon: CheckCircle2 },
  { to: '/taste', label: 'Our Taste', icon: Sparkles },
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          <Icon size={22} strokeWidth={1.9} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
