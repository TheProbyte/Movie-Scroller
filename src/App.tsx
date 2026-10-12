import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppProvider, useApp, useBoot } from './context';
import { TabBar } from './components/TabBar';
import { TitleSheet } from './components/TitleSheet';
import { WhoAmI } from './components/WhoAmI';
import { Home } from './pages/Home';
import { Discover } from './pages/Discover';
import { Watchlist } from './pages/Watchlist';
import { Watched } from './pages/Watched';
import { History } from './pages/History';
import { Taste } from './pages/Taste';
import { NewNight } from './pages/NewNight';
import { JoinNight } from './pages/JoinNight';
import { Night } from './pages/Night';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { Passcode } from './pages/Passcode';

const TAB_ROUTES = ['/', '/discover', '/watchlist', '/watched', '/taste', '/history'];

function Shell() {
  const { me, boot } = useApp();
  const location = useLocation();
  const [params] = useSearchParams();
  const sheetKey = params.get('t');
  const showTabs = TAB_ROUTES.includes(location.pathname);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/watched" element={<Watched />} />
        <Route path="/history" element={<History />} />
        <Route path="/taste" element={<Taste />} />
        <Route path="/night/new" element={<NewNight />} />
        <Route path="/night/join" element={<JoinNight />} />
        <Route path="/night/:id" element={<Night />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {showTabs && <TabBar />}
      <AnimatePresence>{sheetKey && <TitleSheet key={sheetKey} titleKey={sheetKey} sessionId={params.get('s')} />}</AnimatePresence>
      {boot.settings.setupComplete && !me && <WhoAmI />}
    </div>
  );
}

export function App() {
  const boot = useBoot();

  if (boot.isLoading) {
    return (
      <div className="center" style={{ minHeight: '100dvh' }}>
        <div className="spinner" />
      </div>
    );
  }
  if (boot.isError || !boot.data) {
    return (
      <div className="center" style={{ minHeight: '100dvh', padding: 24 }}>
        <div style={{ fontSize: 44 }}>📡</div>
        <h2 className="display" style={{ fontSize: 30 }}>Can’t reach MovieMatch</h2>
        <p className="muted">Make sure the server is running and you’re on the right address.</p>
        <button className="btn primary" onClick={() => boot.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (boot.data.authRequired && !boot.data.authorized) return <Passcode />;

  return (
    <AppProvider boot={boot.data}>
      {!boot.data.settings.setupComplete || !boot.data.tmdbConfigured ? <Setup /> : <Shell />}
    </AppProvider>
  );
}
