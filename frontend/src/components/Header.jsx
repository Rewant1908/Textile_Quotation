/**
 * Header.jsx — Dealer-facing sticky header
 * Only rendered when user.role !== 'admin'.
 * Receives: user, onLogout
 */
export default function Header({ user, onLogout }) {
    return (
        <header className="kt-header">
            <div className="kt-header-brand">
                <div className="kt-header-mark">KT</div>
                <div>
                    <span className="kt-header-name">KT Impex</span>
                    <span className="kt-header-sub">Premium Textile Wholesale</span>
                </div>
            </div>
            <div className="kt-header-user">
                <span className="kt-user-pill">Dealer: {user.username}</span>
                <button className="kt-btn-logout" onClick={onLogout}>Logout</button>
            </div>
        </header>
    )
}
