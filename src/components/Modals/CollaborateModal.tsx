import React, { useState, useEffect } from 'react';
import { Trip, CollaboratorMember, CollaboratorRole, GeneralAccessType } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { enableTripCollaboration } from '../../utils/firebase';
import { User } from 'firebase/auth';
import { getPublicShareBaseUrl } from '../../utils/url';
import {
  X,
  Users,
  Copy,
  Check,
  Send,
  QrCode,
  Shield,
  ShieldCheck,
  Eye,
  Edit3,
  UserPlus,
  Trash2,
  Lock,
  Globe,
  Loader2,
  Crown,
  ChevronDown,
} from 'lucide-react';

interface CollaborateModalProps {
  trip: Trip;
  currentUser: User | null;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onClose: () => void;
}

export const CollaborateModal: React.FC<CollaborateModalProps> = ({
  trip,
  currentUser,
  lang,
  onUpdateTrip,
  onClose,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<CollaboratorRole>('editor');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const ownerEmail = trip.ownerEmail || currentUser?.email || '建立者 (本機)';
  const currentMembers: CollaboratorMember[] = trip.collaborators || [
    {
      id: currentUser?.uid || 'owner',
      email: ownerEmail,
      name: currentUser?.displayName || '行程發起人',
      role: 'owner',
      addedAt: Date.now(),
    },
  ];

  const collabUrl = trip.collabId
    ? `${getPublicShareBaseUrl()}?collab=${trip.collabId}`
    : null;

  // Initialize collaboration room if not yet collaborative
  const ensureCollaborative = async (): Promise<string> => {
    if (trip.collabId && trip.isCollaborative) return trip.collabId;
    setIsActivating(true);
    try {
      const collabId = await enableTripCollaboration(trip, currentUser);
      const updated: Trip = {
        ...trip,
        collabId,
        isCollaborative: true,
        ownerId: currentUser?.uid || 'guest',
        ownerEmail: currentUser?.email || '',
        collaborators: currentMembers,
        generalAccess: trip.generalAccess || 'link_editor',
        updatedAt: Date.now(),
      };
      onUpdateTrip(updated);
      return collabId;
    } finally {
      setIsActivating(false);
    }
  };

  // Add a new collaborator by email with selected role
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail) return;

    // Check if already in list
    if (currentMembers.some((m) => m.email.toLowerCase() === cleanEmail)) {
      alert(lang === 'zh' ? '此帳號/Email 已在成員名單中！' : 'This member is already added.');
      return;
    }

    await ensureCollaborative();

    const newMember: CollaboratorMember = {
      id: `member-${Date.now()}`,
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role: roleInput,
      addedAt: Date.now(),
    };

    const updatedMembers = [...currentMembers, newMember];
    const updatedTrip: Trip = {
      ...trip,
      isCollaborative: true,
      collabId: trip.collabId || `collab_${Date.now().toString(36)}`,
      collaborators: updatedMembers,
      updatedAt: Date.now(),
    };

    onUpdateTrip(updatedTrip);
    setEmailInput('');
  };

  // Change existing member's role
  const handleChangeRole = (memberEmail: string, newRole: CollaboratorRole) => {
    const updatedMembers = currentMembers.map((m) =>
      m.email === memberEmail ? { ...m, role: newRole } : m
    );
    onUpdateTrip({
      ...trip,
      collaborators: updatedMembers,
      updatedAt: Date.now(),
    });
  };

  // Remove collaborator
  const handleRemoveMember = (memberEmail: string) => {
    const updatedMembers = currentMembers.filter((m) => m.email !== memberEmail);
    onUpdateTrip({
      ...trip,
      collaborators: updatedMembers,
      updatedAt: Date.now(),
    });
  };

  // Update general access policy
  const handleChangeGeneralAccess = async (newAccess: GeneralAccessType) => {
    await ensureCollaborative();
    onUpdateTrip({
      ...trip,
      isCollaborative: true,
      generalAccess: newAccess,
      updatedAt: Date.now(),
    });
  };

  const handleCopyLink = async () => {
    const cid = await ensureCollaborative();
    const url = `${getPublicShareBaseUrl()}?collab=${cid}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleNativeShare = async () => {
    const cid = await ensureCollaborative();
    const url = `${getPublicShareBaseUrl()}?collab=${cid}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `共同編輯【${trip.title}】旅遊行程`,
          text: `嗨！已為您開通【${trip.destination}】旅遊行程共編權限，點開即可一起加入編輯規劃：`,
          url,
        });
      } catch (e) {}
    } else {
      handleCopyLink();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {lang === 'zh' ? '行程成員與協作權限管理' : 'Trip Members & Permissions'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'zh' ? '新增成員 Email 並指定編輯或檢視權限' : 'Manage collaborators and access roles'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Trip preview bar */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
                {trip.destination}
              </span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                {trip.title}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>{currentMembers.length} 位成員</span>
            </div>
          </div>

          {/* Form: Add Collaborator Member by Email */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-teal-600" />
              <span>新增協作成員權限：</span>
            </label>

            <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={lang === 'zh' ? '輸入旅伴的 Google 帳號或 Email (如: friend@gmail.com)' : 'Enter collaborator email'}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
              />

              <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <select
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value as CollaboratorRole)}
                    className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-hidden cursor-pointer"
                  >
                    <option value="editor">✏️ 可編輯 (Editor)</option>
                    <option value="viewer">👁️ 僅檢視 (Viewer)</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
                </div>

                <button
                  type="submit"
                  disabled={isActivating || !emailInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs transition active:scale-95 shrink-0 flex items-center gap-1.5 shadow-xs"
                >
                  {isActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>新增</span>
                </button>
              </div>
            </form>
          </div>

          {/* Member List with Permissions */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>已授權成員名單：</span>
              <span className="text-[11px] text-slate-400 font-normal">
                擁有者可隨時切換成員為「可編輯」或「僅檢視」
              </span>
            </label>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              {currentMembers.map((member) => {
                const isOwner = member.role === 'owner';
                return (
                  <div key={member.email} className="p-3 sm:px-4 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold flex items-center justify-center text-xs shrink-0">
                        {isOwner ? <Crown className="w-4 h-4 text-amber-500" /> : member.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {member.email}
                          </p>
                          {isOwner && (
                            <span className="px-2 py-0.2 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                              建立者
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {isOwner ? '擁有完整控制權' : member.role === 'editor' ? '可新增與修改所有日程' : '僅可查閱最新進度與天氣'}
                        </p>
                      </div>
                    </div>

                    {/* Role Control */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isOwner ? (
                        <span className="px-2.5 py-1 text-slate-500 text-xs font-semibold">擁有者</span>
                      ) : (
                        <>
                          <div className="relative flex items-center">
                            <select
                              value={member.role}
                              onChange={(e) => handleChangeRole(member.email, e.target.value as CollaboratorRole)}
                              className="appearance-none pl-2.5 pr-7 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold focus:outline-hidden cursor-pointer"
                            >
                              <option value="editor">可編輯</option>
                              <option value="viewer">僅檢視</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.email)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title="移除成員權限"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* General Access Policy */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  一般存取權限（連結權限）
                </span>
              </div>

              <div className="relative flex items-center">
                <select
                  value={trip.generalAccess || 'link_editor'}
                  onChange={(e) => handleChangeGeneralAccess(e.target.value as GeneralAccessType)}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-hidden cursor-pointer shadow-2xs"
                >
                  <option value="restricted">🔒 僅限受邀成員 (Restricted)</option>
                  <option value="link_editor">✏️ 知道連結的人皆可編輯</option>
                  <option value="link_viewer">👁️ 知道連結的人僅可檢視</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {trip.generalAccess === 'restricted'
                ? '只有在上方成員名單內的 Email 帳號登入後才能存取此旅程。'
                : trip.generalAccess === 'link_viewer'
                ? '任何取得連結的人皆可瀏覽行程，但只有被指派為編輯者的成員才可修改。'
                : '只要收到專屬連結的親友旅伴皆可直接加入即時共編。'}
            </p>
          </div>

          {/* Share Link & QR section */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              行程共編邀請連結：
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={collabUrl || '點擊下方按鈕即可複製專屬邀請連結'}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono outline-hidden select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition active:scale-95 shrink-0 flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已複製！' : '複製連結'}</span>
              </button>
            </div>

            {/* Quick action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleNativeShare}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Send className="w-3.5 h-3.5 text-teal-600" />
                <span>傳送至 LINE / 通訊軟體</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <QrCode className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>{showQr ? '隱藏 QR Code' : '顯示 QR 碼'}</span>
              </button>
            </div>

            {showQr && collabUrl && (
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center space-y-1.5 animate-in fade-in duration-150">
                <div className="inline-block p-2 rounded-xl bg-white shadow-xs border border-slate-100">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(collabUrl)}`}
                    alt="Collaborate Trip QR Code"
                    className="w-32 h-32 mx-auto"
                    loading="lazy"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  同行朋友拿出手機相機掃描，即可立刻開啟並依權限檢視或共編！
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Wayfarer 權限型多人協同編輯
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
