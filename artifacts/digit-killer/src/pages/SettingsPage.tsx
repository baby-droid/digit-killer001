import { useState } from "react";
import {
  useAdminLogin,
  useGetUsers,
  useCreateUser,
  useDeleteUser,
  useRevokeUser,
  getGetUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shield, Users, Trash2, UserX, Copy, Check, RefreshCw, AlertCircle, KeyRound } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

interface User {
  id: number;
  user_id: string;
  username: string;
  active: boolean;
  created_at: string;
  revoked_at: string | null;
  generated_password?: string;
}

function CopyBox({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2 border border-border/60">
      <div className="flex-1 min-w-0">
        <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
        <div className="font-orbitron text-sm font-bold text-primary truncate">{value}</div>
      </div>
      <button
        onClick={copy}
        className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
        data-testid={`button-copy-${label.toLowerCase().replace(" ", "-")}`}
      >
        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const adminLogin = useAdminLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    adminLogin.mutate(
      { data: { password } },
      {
        onSuccess: (res) => {
          const r = res as { token: string };
          onSuccess(r.token);
        },
        onError: () => setError("Invalid admin PIN"),
      }
    );
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="cyber-card p-8 flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Shield size={28} className="text-primary" />
        </div>
        <div className="text-center">
          <div className="font-orbitron text-lg font-bold text-primary tracking-wider">ADMIN ACCESS</div>
          <div className="font-rajdhani text-xs text-muted-foreground tracking-widest mt-1">
            Enter admin PIN to continue
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin PIN"
              className="w-full bg-muted/40 border border-border/60 rounded-md px-4 py-2.5 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              data-testid="input-admin-password"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs font-rajdhani">
              <AlertCircle size={12} />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={adminLogin.isPending || !password}
            className="w-full py-2.5 rounded-md font-orbitron text-sm font-bold tracking-widest bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
            data-testid="button-admin-login"
          >
            {adminLogin.isPending ? "VERIFYING..." : "ACCESS CONTROL PANEL"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ChangePinSection() {
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("idle");
    setErrorMsg("");

    if (newPin.length < 4) {
      setStatus("error");
      setErrorMsg("PIN must be at least 4 characters");
      return;
    }
    if (newPin !== confirmPin) {
      setStatus("error");
      setErrorMsg("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/admin/pin", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ new_pin: newPin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorMsg((data as { error?: string }).error ?? "Failed to update PIN");
      } else {
        setStatus("success");
        setNewPin("");
        setConfirmPin("");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cyber-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={14} className="text-primary" />
        <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">
          Change Admin PIN
        </span>
      </div>
      <form onSubmit={handleChange} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="New PIN"
            className="bg-muted/40 border border-border/60 rounded-md px-3 py-2 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            data-testid="input-new-pin"
          />
          <input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder="Confirm PIN"
            className="bg-muted/40 border border-border/60 rounded-md px-3 py-2 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            data-testid="input-confirm-pin"
          />
        </div>

        {status === "error" && (
          <div className="flex items-center gap-2 text-destructive text-xs font-rajdhani">
            <AlertCircle size={12} />
            {errorMsg}
          </div>
        )}
        {status === "success" && (
          <div className="flex items-center gap-2 text-green-400 text-xs font-rajdhani">
            <Check size={12} />
            PIN updated successfully
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !newPin || !confirmPin}
          className="px-4 py-2 rounded-md font-rajdhani font-bold text-xs tracking-widest uppercase bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
          data-testid="button-change-pin"
        >
          {loading ? "UPDATING..." : "UPDATE PIN"}
        </button>
      </form>
    </div>
  );
}

function AdminPanel() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [newUser, setNewUser] = useState<User | null>(null);

  const { data: users, isLoading: usersLoading, refetch } = useGetUsers({
    query: {
      queryKey: getGetUsersQueryKey(),
      refetchInterval: 10000,
    },
  } as Parameters<typeof useGetUsers>[0]);

  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const revokeUser = useRevokeUser();
  const { data: health } = useHealthCheck();

  const usersList = (users as User[]) ?? [];
  const healthData = health as { status?: string } | undefined;

  const handleCreate = () => {
    if (!username.trim()) return;
    createUser.mutate(
      { data: { username: username.trim() } },
      {
        onSuccess: (res) => {
          setNewUser(res as User);
          setUsername("");
          qc.invalidateQueries({ queryKey: getGetUsersQueryKey() });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteUser.mutate(
      { id: String(id) } as Parameters<typeof deleteUser.mutate>[0],
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetUsersQueryKey() }) }
    );
  };

  const handleRevoke = (id: number) => {
    revokeUser.mutate(
      { id: String(id) } as Parameters<typeof revokeUser.mutate>[0],
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetUsersQueryKey() }) }
    );
  };

  return (
    <div className="space-y-4">
      {/* System status */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw size={14} className="text-primary" />
          <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">
            System Diagnostics
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-muted/30 rounded-md p-3">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">API Status</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="live-dot w-2 h-2" />
              <span className="font-orbitron text-xs text-green-400 font-bold">
                {healthData?.status === "ok" ? "ONLINE" : "CHECKING..."}
              </span>
            </div>
          </div>
          <div className="bg-muted/30 rounded-md p-3">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Deriv Feed</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="live-dot w-2 h-2" />
              <span className="font-orbitron text-xs text-green-400 font-bold">CONNECTED</span>
            </div>
          </div>
          <div className="bg-muted/30 rounded-md p-3">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Total Users</div>
            <div className="font-orbitron text-xl font-bold text-primary mt-1">
              {usersList.length}
            </div>
          </div>
        </div>
      </div>

      {/* Change admin PIN */}
      <ChangePinSection />

      {/* Generate user */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-primary" />
          <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">
            Generate New User ID
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Enter username"
            className="flex-1 bg-muted/40 border border-border/60 rounded-md px-3 py-2 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            data-testid="input-new-username"
          />
          <button
            onClick={handleCreate}
            disabled={createUser.isPending || !username.trim()}
            className="px-4 py-2 rounded-md font-rajdhani font-bold text-xs tracking-widest uppercase bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
            data-testid="button-generate-user"
          >
            {createUser.isPending ? "..." : "Generate"}
          </button>
        </div>

        {/* Newly created user */}
        {newUser && (
          <div
            className="mt-4 p-4 rounded-lg border border-green-500/30 bg-green-500/05 space-y-2"
            data-testid="box-new-user"
          >
            <div className="font-rajdhani text-xs text-green-400 font-bold tracking-widest uppercase mb-2">
              User Created Successfully
            </div>
            <CopyBox value={newUser.user_id} label="User ID" />
            {newUser.generated_password && (
              <CopyBox value={newUser.generated_password} label="Password" />
            )}
            <CopyBox value={newUser.username} label="Username" />
          </div>
        )}
      </div>

      {/* User list */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-muted-foreground" />
            <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">
              User Accounts ({usersList.length})
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-primary transition-colors"
            data-testid="button-refresh-users"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {usersLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : usersList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-rajdhani text-sm">
            No users yet. Generate the first one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  {["Username", "User ID", "Status", "Created", "Actions"].map((h) => (
                    <th key={h} className="text-left pb-2 font-rajdhani text-muted-foreground tracking-wider font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usersList.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                    data-testid={`row-user-${user.id}`}
                  >
                    <td className="py-2 font-rajdhani font-semibold text-foreground">
                      {user.username}
                    </td>
                    <td className="py-2 font-orbitron text-primary/80">{user.user_id}</td>
                    <td className="py-2">
                      {user.active ? (
                        <span className="risk-low">ACTIVE</span>
                      ) : (
                        <span className="risk-high">REVOKED</span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground font-rajdhani">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {user.active && (
                          <button
                            onClick={() => handleRevoke(user.id)}
                            className="text-yellow-500/70 hover:text-yellow-400 transition-colors"
                            title="Revoke access"
                            data-testid={`button-revoke-${user.id}`}
                          >
                            <UserX size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-destructive/70 hover:text-destructive transition-colors"
                          title="Delete user"
                          data-testid={`button-delete-${user.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("admin_token"));

  const handleLogin = (t: string) => {
    localStorage.setItem("admin_token", t);
    setToken(t);
  };

  return (
    <div className="space-y-4 animate-fade-in-up max-w-4xl" data-testid="page-settings">
      <div>
        <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
          ADMIN CONTROL PANEL
        </h2>
        <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
          User Management · System Diagnostics · Access Control
        </p>
      </div>

      {!token ? <LoginForm onSuccess={handleLogin} /> : <AdminPanel />}
    </div>
  );
}
