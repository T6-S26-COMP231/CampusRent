import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  PlusCircle,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout, isVerified, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
      isActive
        ? 'bg-campus-50 text-campus-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const closeMobile = () => setMobileOpen(false);

  const signOut = () => {
    logout();
    closeMobile();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="CampusRent home">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-campus-500 to-campus-800 text-white shadow-md">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <span className="block font-display text-xl font-extrabold tracking-tight text-campus-950">
                CampusRent
              </span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Iteration 2 test bed
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {isVerified && (
              <>
                <NavLink to="/browse" className={navLinkClass}>
                  <Search className="h-4 w-4" /> Browse
                </NavLink>
                <NavLink to="/my-listings" className={navLinkClass}>
                  <Package className="h-4 w-4" /> My Listings
                </NavLink>
                <NavLink to="/listings/new" className={navLinkClass}>
                  <PlusCircle className="h-4 w-4" /> List Item
                </NavLink>
                <NavLink to="/requests" className={navLinkClass}>
                  <ClipboardList className="h-4 w-4" /> Incoming Requests
                </NavLink>
                <NavLink to="/my-requests" className={navLinkClass}>
                  <ClipboardList className="h-4 w-4" /> My Requests
                </NavLink>
                <NavLink to="/conversations" className={navLinkClass}>
                  <MessageCircle className="h-4 w-4" /> Conversations
                </NavLink>
              </>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                <ShieldCheck className="h-4 w-4" /> Verify Students
              </NavLink>
            )}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <>
                <NavLink to="/account" className={navLinkClass}>
                  <User className="h-4 w-4" />
                  {user.first_name}
                </NavLink>
                <button onClick={signOut} className="btn-secondary !px-3 !py-2" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">Sign In</Link>
                <Link to="/register" className="btn-primary">Register</Link>
              </>
            )}
          </div>

          <button
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-100 bg-white px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              {isVerified && (
                <>
                  <NavLink to="/browse" className={navLinkClass} onClick={closeMobile}>Browse</NavLink>
                  <NavLink to="/my-listings" className={navLinkClass} onClick={closeMobile}>My Listings</NavLink>
                  <NavLink to="/listings/new" className={navLinkClass} onClick={closeMobile}>List Item</NavLink>
                  <NavLink to="/requests" className={navLinkClass} onClick={closeMobile}>Incoming Requests</NavLink>
                  <NavLink to="/my-requests" className={navLinkClass} onClick={closeMobile}>My Requests</NavLink>
                  <NavLink to="/conversations" className={navLinkClass} onClick={closeMobile}>Conversations</NavLink>
                </>
              )}
              {isAdmin && (
                <NavLink to="/admin" className={navLinkClass} onClick={closeMobile}>Verify Students</NavLink>
              )}
              {user ? (
                <>
                  <NavLink to="/account" className={navLinkClass} onClick={closeMobile}>Account</NavLink>
                  <button onClick={signOut} className={navLinkClass({ isActive: false })}>Sign Out</button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className={navLinkClass} onClick={closeMobile}>Sign In</NavLink>
                  <NavLink to="/register" className={navLinkClass} onClick={closeMobile}>Register</NavLink>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      <main><Outlet /></main>

      <footer className="mt-20 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-9 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-campus-600 text-white">
              <Package className="h-4 w-4" />
            </div>
            <span className="font-display font-bold text-campus-950">CampusRent</span>
          </div>
          <p className="text-sm text-slate-500">Verified students sharing useful items within their campus community.</p>
          <p className="text-xs text-slate-400">COMP 231 · Team 6 · Iteration 2</p>
        </div>
      </footer>
    </div>
  );
}
