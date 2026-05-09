import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { magicLogin } from '../../api/auth.api';
import { useAuth } from '../../contexts/AuthContext';

const roleHome = {
  super_admin: '/super-admin/dashboard',
  school_admin:'/admin/dashboard',
  teacher:     '/teacher/dashboard',
  student:     '/student/dashboard',
  parent:      '/parent/dashboard',
};

export default function MagicLogin() {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const { signIn }  = useAuth();
  const attempted   = useRef(false);

  useEffect(() => {
    // React 18 Strict Mode mounts effects twice in dev — ref prevents double API call
    // (which would consume the one-time token on the first call and fail on the second)
    if (attempted.current) return;
    attempted.current = true;

    magicLogin(token)
      .then((res) => {
        signIn(res.token, res.refreshToken, res.user);
        // window.location.replace clears the page before toast renders,
        // so persist the message in sessionStorage and show it after reload
        sessionStorage.setItem('welcome_msg', `Welcome, ${res.user.name}!`);
        window.location.replace(roleHome[res.user.role] || '/');
      })
      .catch(() => {
        toast.error('Invalid or expired magic link');
        navigate('/login');
      });
  }, [token]);

  return (
    <div className="loading-page">
      <div className="spinner" />
      <p>Authenticating via magic link…</p>
    </div>
  );
}
