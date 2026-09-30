import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
export type Client = {
  id: string;
  name: string;
  email: string;
  selectedRole: 'renter' | 'lessor' | null;
  adminSession: boolean;
  permissions: {
    platformAdmin: boolean;
    manageRequests: boolean;
    reviewBrokers: boolean;
  };
};
let visitRequest: Promise<Response> | undefined;
const Auth = createContext<{
  user: Client | null;
  loading: boolean;
  error: string;
  setUser: (u: Client | null) => void;
  refresh: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const generation = useRef(0);
  const [user, setStoredUser] = useState<Client | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const setUser = useCallback((u: Client | null) => {
    generation.current++;
    setStoredUser(u);
    setError('');
  }, []);
  async function refresh() {
    const request = ++generation.current;
    try {
      const response = await fetch('/api/client/me', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (request !== generation.current) return;
      if (response.status === 401) {
        setStoredUser(null);
        setError('');
        return;
      }
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.user?.id) throw new Error();
      if (request === generation.current) {
        setStoredUser(data.user);
        setError('');
      }
    } catch {
      if (request === generation.current)
        setError('تعذر التحقق من الجلسة. أعد المحاولة.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    visitRequest ??= fetch('/api/client/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    void visitRequest.catch(() => {});
    const check = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('focus', check);
    window.addEventListener('hashchange', check);
    const timer = window.setInterval(check, 60000);
    return () => {
      generation.current++;
      window.removeEventListener('focus', check);
      window.removeEventListener('hashchange', check);
      clearInterval(timer);
    };
  }, []);
  return (
    <Auth.Provider value={{ user, loading, error, setUser, refresh }}>
      {children}
    </Auth.Provider>
  );
}
export const useAuth = () => useContext(Auth)!;
export async function authAction(action: string, body: object) {
  const response = await fetch('/api/client/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'تعذر إكمال الطلب.');
  return data;
}
