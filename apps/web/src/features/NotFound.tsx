import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="notfound">
      <span className="code">404</span>
      <p>no forecast at this address — and we never back-fill.</p>
      <Link to="/">← back to the overview</Link>
    </div>
  );
}
