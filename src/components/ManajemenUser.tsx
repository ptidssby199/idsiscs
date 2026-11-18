import React, { useState, useEffect } from 'react';
import {
  apiGetUserList,
  apiCreateUser,
  apiUpdateUserAccess,
  apiResetUserPin,
  apiDeleteUser
} from '../db';
import { User } from '../types';
import { UserPlus, ShieldAlert, Key, UserCheck, Trash2, Edit } from 'lucide-react';

interface ManajemenUserProps {
  currentUser: any;
  onUsersChanged?: () => void;
}

const MENU_LIST = [
  { id: 'pageDashboard', label: 'Dashboard' },
  { id: 'pageCreateBale', label: 'Buat Bale Baru (Masuk Stok)' },
  { id: 'pageBuying', label: 'Buying' },
  { id: 'pageReclass', label: 'Reclass' },
  { id: 'pageShipping', label: 'Shipping' },
  { id: 'pageMaster', label: 'Master Harga' },
  { id: 'pageBarcode', label: 'Pengaturan Barcode' },
  { id: 'pagePrePrint', label: 'PrePrint Barcode' },
  { id: 'pageInvoice', label: 'Cetak Invoice' },
  { id: 'pageBackupSync', label: 'Backup & Sinkronisasi' },
  { id: 'pageUsers', label: 'Manajemen User' },
  { id: 'pageDiag', label: 'Diagnostik' },
  { id: 'pageLaporan', label: 'Laporan & Export' },
  { id: 'lapDailyBuying', label: ' ↳ Laporan Daily Buying' },
  { id: 'lapBuying', label: ' ↳ Laporan Detail Buying' },
  { id: 'lapReclass', label: ' ↳ Laporan Reclass' },
  { id: 'lapShipping', label: ' ↳ Laporan Shipping' },
  { id: 'lapInvoice', label: ' ↳ Laporan Invoice' },
  { id: 'lapBvR', label: ' ↳ Laporan Buying vs Reclass' },
  { id: 'lapStok', label: ' ↳ Laporan Stok' }
];

export const ManajemenUser: React.FC<ManajemenUserProps> = ({ currentUser, onUsersChanged }) => {
  const [userList, setUserList] = useState<any[]>([]);

  // Add user fields
  const [nuUsername, setNuUsername] = useState('');
  const [nuPin, setNuPin] = useState('');
  const [nuNama, setNuNama] = useState('');
  const [nuRole, setNuRole] = useState<'admin' | 'user'>('user');
  const [nuAccess, setNuAccess] = useState<string[]>([]);

  // Edit user access state
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [uaNama, setUaNama] = useState('');
  const [uaRole, setUaRole] = useState<'admin' | 'user'>('user');
  const [uaAccess, setUaAccess] = useState<string[]>([]);

  // Reset PIN modal state
  const [resettingUser, setResettingUser] = useState<any | null>(null);
  const [rpPin, setRpPin] = useState('');

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const fetchUsers = () => {
    if (!currentUser) return;
    const res = apiGetUserList(currentUser.username);
    if (res.success && res.users) {
      setUserList(res.users);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUser]);

  useEffect(() => {
    const handleDbUpdate = () => {
      fetchUsers();
    };
    window.addEventListener('iscs-db-update', handleDbUpdate);
    return () => {
      window.removeEventListener('iscs-db-update', handleDbUpdate);
    };
  }, []);

  const showToast = (text: string, type: 'ok' | 'err') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuUsername.trim() || !nuPin.trim()) {
      showToast('Username dan PIN wajib diisi.', 'err');
      return;
    }
    if (!/^\d{4,8}$/.test(nuPin.trim())) {
      showToast('PIN harus angka 4-8 digit.', 'err');
      return;
    }

    const payload = {
      username: nuUsername.trim().toLowerCase(),
      pin: nuPin.trim(),
      nama: nuNama.trim(),
      role: nuRole,
      menuAccess: nuAccess
    };

    const res = apiCreateUser(payload, currentUser.username);
    if (res.success) {
      showToast(res.message || 'User berhasil ditambahkan.', 'ok');
      setNuUsername('');
      setNuPin('');
      setNuNama('');
      setNuRole('user');
      setNuAccess([]);
      fetchUsers();
      if (onUsersChanged) onUsersChanged();
    } else {
      showToast(res.message || 'Gagal menambahkan user.', 'err');
    }
  };

  const handleToggleNuAccess = (menuId: string) => {
    setNuAccess(prev =>
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
    );
  };

  const handleToggleUaAccess = (menuId: string) => {
    setUaAccess(prev =>
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
    );
  };

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setUaNama(u.nama || '');
    setUaRole(u.role);
    setUaAccess(Array.isArray(u.menuAccess) ? u.menuAccess : []);
  };

  const closeEditModal = () => {
    setEditingUser(null);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    const payload = {
      username: editingUser.username,
      nama: uaNama.trim(),
      role: uaRole,
      menuAccess: uaAccess
    };

    const res = apiUpdateUserAccess(payload, currentUser.username);
    if (res.success) {
      showToast(res.message || 'Hak akses user diperbarui.', 'ok');
      closeEditModal();
      fetchUsers();
      if (onUsersChanged) onUsersChanged();
    } else {
      showToast(res.message || 'Gagal memperbarui.', 'err');
    }
  };

  const openResetPin = (u: any) => {
    setResettingUser(u);
    setRpPin('');
  };

  const closeResetPin = () => {
    setResettingUser(null);
  };

  const handleResetPin = () => {
    if (!resettingUser) return;
    if (!/^\d{4,8}$/.test(rpPin.trim())) {
      showToast('PIN harus berupa 4-8 digit angka.', 'err');
      return;
    }

    const res = apiResetUserPin({ username: resettingUser.username, pin: rpPin.trim() }, currentUser.username);
    if (res.success) {
      showToast(res.message || 'PIN berhasil direset.', 'ok');
      closeResetPin();
    } else {
      showToast(res.message || 'Gagal mereset PIN.', 'err');
    }
  };

  const handleDeleteUser = (username: string) => {
    if (!confirm(`Hapus user "${username}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    const res = apiDeleteUser({ username }, currentUser.username);
    if (res.success) {
      showToast('User berhasil dihapus.', 'ok');
      fetchUsers();
      if (onUsersChanged) onUsersChanged();
    } else {
      showToast(res.message || 'Gagal menghapus.', 'err');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-4 rounded-xl shadow-xl font-bold flex items-center gap-3 text-sm text-white ${toastMsg.type === 'ok' ? 'bg-emerald-600 border-l-4 border-emerald-300' : 'bg-rose-600 border-l-4 border-rose-300'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Add User Form */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <h3 className="text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
          <UserPlus size={18} className="text-amber-500" />
          Tambah User Baru
        </h3>

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-1">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Username (Unik)
              </label>
              <input
                type="text"
                value={nuUsername}
                onChange={e => setNuUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="mis. budi"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                PIN (4-8 Digit Angka)
              </label>
              <input
                type="text"
                value={nuPin}
                onChange={e => setNuPin(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                placeholder="mis. 1234"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={nuNama}
                onChange={e => setNuNama(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Nama Lengkap Operator"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                Role
              </label>
              <select
                value={nuRole}
                onChange={e => setNuRole(e.target.value as 'admin' | 'user')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl text-sm transition"
            >
              Tambah User
            </button>
          </div>

          <div className="lg:col-span-2 space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
              Akses Menu / Halaman
            </label>
            {nuRole === 'admin' ? (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 border-dashed text-slate-500 text-xs flex gap-2 items-start">
                <ShieldAlert size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p>
                  Role Admin otomatis memiliki hak akses penuh (<b>ALL</b>) ke semua menu dan fungsionalitas, termasuk pengaturan barcode, diagnostic, dan penambahan menu di masa mendatang.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-100 rounded-xl p-4 max-h-72 overflow-y-auto bg-slate-50/50">
                {MENU_LIST.map(m => (
                  <label key={m.id} className="flex items-center gap-2.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={nuAccess.includes(m.id)}
                      onChange={() => handleToggleNuAccess(m.id)}
                      className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-slate-300 rounded"
                    />
                    <span className={m.id.startsWith('lap') ? 'font-medium text-slate-400 font-mono' : 'font-semibold'}>
                      {m.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* User Directory List */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
        <h3 className="text-md font-extrabold text-slate-800 flex items-center gap-2">
          <UserCheck size={18} className="text-teal-500" />
          Daftar User &amp; Operator
        </h3>

        <div className="border border-slate-100 rounded-xl overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-xs uppercase">Username</th>
                <th className="px-4 py-2.5 text-xs uppercase">Nama Lengkap</th>
                <th className="px-4 py-2.5 text-xs uppercase">Role</th>
                <th className="px-4 py-2.5 text-xs uppercase">Akses Menu</th>
                <th className="px-4 py-2.5 text-xs uppercase w-48 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Belum ada user terdaftar.
                  </td>
                </tr>
              ) : (
                userList.map((u, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 text-xs">
                    <td className="px-4 py-3 font-semibold text-slate-700 font-mono">{u.username}</td>
                    <td className="px-4 py-3 text-slate-600">{u.nama || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.menuAccess === 'ALL' ? (
                        <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded text-[10px]">ALL (Semua Menu)</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.menuAccess.length === 0 ? (
                            <span className="text-slate-400 italic">None (Tanpa Akses)</span>
                          ) : (
                            u.menuAccess.map((mId: string) => {
                              const match = MENU_LIST.find(x => x.id === mId);
                              return (
                                <span key={mId} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">
                                  {match ? match.label.replace(' ↳ ', '') : mId}
                                </span>
                              );
                            })
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(u)}
                        className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded transition inline-flex items-center gap-1"
                      >
                        <Edit size={10} /> Akses
                      </button>
                      <button
                        onClick={() => openResetPin(u)}
                        className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded transition inline-flex items-center gap-1"
                      >
                        <Key size={10} /> Reset PIN
                      </button>
                      {u.username !== currentUser.username && (
                        <button
                          onClick={() => handleDeleteUser(u.username)}
                          className="px-2 py-1 border border-rose-200 hover:bg-rose-50 text-[10px] font-bold text-rose-700 rounded transition inline-flex items-center gap-1"
                        >
                          <Trash2 size={10} /> Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Access Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-md font-extrabold text-slate-800">
                Edit Hak Akses &mdash; <span className="font-mono text-amber-600">{editingUser.username}</span>
              </h3>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-600 text-lg font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={uaNama}
                  onChange={e => setUaNama(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Role
                </label>
                <select
                  value={uaRole}
                  onChange={e => setUaRole(e.target.value as 'admin' | 'user')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Akses Menu
                </label>
                {uaRole === 'admin' ? (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 border-dashed text-slate-500 text-xs flex gap-2">
                    <ShieldAlert size={16} className="text-amber-500 flex-shrink-0" />
                    <p>Role Admin otomatis memiliki hak akses ke semua menu (ALL).</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                    {MENU_LIST.map(m => (
                      <label key={m.id} className="flex items-center gap-2.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={uaAccess.includes(m.id)}
                          onChange={() => handleToggleUaAccess(m.id)}
                          className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-slate-300 rounded"
                        />
                        <span className={m.id.startsWith('lap') ? 'font-medium text-slate-400 font-mono' : 'font-semibold'}>
                          {m.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={closeEditModal} className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-200">
                Batal
              </button>
              <button onClick={handleUpdateUser} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-xl shadow">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-md font-extrabold text-slate-800">
                Reset PIN &mdash; <span className="font-mono text-amber-600">{resettingUser.username}</span>
              </h3>
              <button onClick={closeResetPin} className="text-slate-400 hover:text-slate-600 text-lg font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  PIN Baru (4-8 Digit Angka)
                </label>
                <input
                  type="text"
                  value={rpPin}
                  onChange={e => setRpPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="mis. 1234"
                  maxLength={8}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button onClick={closeResetPin} className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-200">
                Batal
              </button>
              <button onClick={handleResetPin} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-xl shadow">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
