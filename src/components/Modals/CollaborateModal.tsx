import React, { useMemo, useState } from 'react';
import { Trip, CollaboratorMember, CollaboratorRole, GeneralAccessType } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { enableTripCollaboration } from '../../utils/firebase';
import { User } from 'firebase/auth';
import { getPublicShareBaseUrl } from '../../utils/url';
import { copyTextToClipboard } from '../../utils/clipboard';
import { generateQrSvgPath } from '../../utils/qrCode';
import {
  IosModalSheet,
  IosNavBar,
  IosInsetGroup,
  IosRow,
  IosDisclosureRow,
  IosCheckmarkRow,
} from '../UI/IosPrimitives';
import {
  Users,
  Copy,
  Check,
  Send,
  QrCode,
  UserPlus,
  Trash2,
  Globe,
  Loader2,
  Crown,
  ChevronRight,
} from 'lucide-react';

interface CollaborateModalProps {
  trip: Trip;
  currentUser: User | null;
  lang: Language;
  onRequireAuth?: () => void;
  onUpdateTrip: (updatedTrip: Trip) => void;
  onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERAL_ACCESS_OPTIONS: { value: GeneralAccessType; label: string; desc: string }[] = [
  { value: 'restricted', label: '僅限受邀成員', desc: '僅名單內的 Email 可存取此行程' },
  { value: 'link_viewer', label: '知道連結者僅可檢視', desc: '取得連結者可瀏覽，僅編輯者可修改' },
  { value: 'link_editor', label: '知道連結者皆可編輯', desc: '取得連結者皆可即時共同編輯' },
];

export const CollaborateModal: React.FC<CollaborateModalProps> = ({
  trip,
  currentUser,
  lang,
  onRequireAuth,
  onUpdateTrip,
  onClose,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<CollaboratorRole>('editor');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showAccessPicker, setShowAccessPicker] = useState(false);
  const [expandedMemberEmail, setExpandedMemberEmail] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const isOwner = !trip.ownerId || Boolean(currentUser && currentUser.uid === trip.ownerId);
  const ownerEmail = trip.ownerEmail || currentUser?.email || '建立者 (本機)';
  const currentMembers: CollaboratorMember[] =
    trip.collaborators && trip.collaborators.length > 0
      ? trip.collaborators
      : [
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
  const qrSvg = useMemo(() => (collabUrl ? generateQrSvgPath(collabUrl) : null), [collabUrl]);

  const ensureCollaborative = async (): Promise<string> => {
    if (!currentUser) {
      onRequireAuth?.();
      throw new Error(lang === 'zh' ? '請先登入 Google 帳號，再啟用或管理多人共編' : 'Please sign in first.');
    }
    if (!isOwner) {
      throw new Error(lang === 'zh' ? '僅行程建立者可變更成員與權限設定' : 'Only the trip owner can manage permissions.');
    }
    if (trip.collabId && trip.isCollaborative) return trip.collabId;
    setIsActivating(true);
    try {
      const normalizedTrip: Trip = {
        ...trip,
        ownerId: trip.ownerId || currentUser.uid,
        ownerEmail: trip.ownerEmail || currentUser.email || '',
        collaborators: currentMembers,
        generalAccess: trip.generalAccess || 'link_viewer',
      };
      const collabId = await enableTripCollaboration(normalizedTrip, currentUser);
      const updated: Trip = {
        ...normalizedTrip,
        collabId,
        isCollaborative: true,
        updatedAt: Date.now(),
      };
      onUpdateTrip(updated);
      return collabId;
    } finally {
      setIsActivating(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      setMemberError('僅行程建立者可新增或修改成員權限');
      return;
    }
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      setMemberError(lang === 'zh' ? '請輸入有效的 Email 格式（例如 name@example.com）' : 'Invalid email address.');
      return;
    }
    if (currentMembers.some((m) => m.email.toLowerCase() === cleanEmail)) {
      setMemberError(lang === 'zh' ? '此帳號已在成員名單中' : 'Member already added.');
      return;
    }
    setMemberError(null);

    try {
      const cid = await ensureCollaborative();
      const newMember: CollaboratorMember = {
        id: `member-${Date.now()}`,
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        role: roleInput,
        addedAt: Date.now(),
      };
      const updatedTrip: Trip = {
        ...trip,
        isCollaborative: true,
        collabId: cid,
        ownerId: trip.ownerId || currentUser?.uid,
        ownerEmail: trip.ownerEmail || currentUser?.email || '',
        generalAccess: trip.generalAccess || 'link_viewer',
        collaborators: [...currentMembers, newMember],
        updatedAt: Date.now(),
      };
      onUpdateTrip(updatedTrip);
      setEmailInput('');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法新增成員，請稍後重試');
    }
  };

  const handleChangeRole = (memberEmail: string, newRole: CollaboratorRole) => {
    if (!isOwner) {
      setMemberError('僅行程建立者可調整成員角色');
      return;
    }
    const targetEmail = memberEmail.trim().toLowerCase();
    const updatedMembers = currentMembers.map((m) =>
      m.email.trim().toLowerCase() === targetEmail ? { ...m, role: newRole } : m
    );
    onUpdateTrip({
      ...trip,
      collaborators: updatedMembers,
      updatedAt: Date.now(),
    });
    setExpandedMemberEmail(null);
  };

  const handleRemoveMember = (memberEmail: string) => {
    if (!isOwner) {
      setMemberError('僅行程建立者可移除成員');
      return;
    }
    const targetEmail = memberEmail.trim().toLowerCase();
    const updatedMembers = currentMembers.filter((m) => m.email.trim().toLowerCase() !== targetEmail);
    onUpdateTrip({
      ...trip,
      collaborators: updatedMembers,
      updatedAt: Date.now(),
    });
    setExpandedMemberEmail(null);
  };

  const handleChangeGeneralAccess = async (newAccess: GeneralAccessType) => {
    if (!isOwner) {
      setMemberError('僅行程建立者可變更連結權限設定');
      return;
    }
    setMemberError(null);
    try {
      const cid = await ensureCollaborative();
      onUpdateTrip({
        ...trip,
        collabId: cid,
        isCollaborative: true,
        generalAccess: newAccess,
        updatedAt: Date.now(),
      });
      setShowAccessPicker(false);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法更新連結權限');
    }
  };

  const handleCopyLink = async () => {
    setMemberError(null);
    try {
      const cid = collabUrl && trip.collabId ? trip.collabId : await ensureCollaborative();
      const url = `${getPublicShareBaseUrl()}?collab=${cid}`;
      const ok = await copyTextToClipboard(url);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        setMemberError('無法複製連結，請長按或全選上方連結複製');
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法產生並複製共編連結');
    }
  };

  const handleNativeShare = async () => {
    setMemberError(null);
    try {
      const cid = collabUrl && trip.collabId ? trip.collabId : await ensureCollaborative();
      const url = `${getPublicShareBaseUrl()}?collab=${cid}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `共同編輯【${trip.title}】旅遊行程`,
            text: `嗨！已為您開通【${trip.destination}】旅遊行程共編權限，點開即可一起加入編輯規劃：`,
            url,
          });
        } catch {
          // Cancelled
        }
      } else {
        const ok = await copyTextToClipboard(url);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } else {
          setMemberError('無法複製連結，請長按或全選上方連結複製');
        }
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '無法分享共編邀請');
    }
  };

  const currentAccessMeta =
    GENERAL_ACCESS_OPTIONS.find((o) => o.value === (trip.generalAccess || 'link_viewer')) ||
    GENERAL_ACCESS_OPTIONS[1];

  return (
    <IosModalSheet
      onClose={onClose}
      maxWidthClass="sm:max-w-xl"
      zIndexClass="z-[70]"
      variant="grouped"
      ariaLabel={lang === 'zh' ? '成員與權限' : 'Members & Permissions'}
    >
      <IosNavBar
        title={lang === 'zh' ? '成員與權限' : 'Members & Permissions'}
        subtitle={`${trip.title} · ${currentMembers.length} 位成員`}
        rightLabel={lang === 'zh' ? '完成' : 'Done'}
        onRightClick={onClose}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] space-y-5">
        {/* Add Member Group */}
        <IosInsetGroup
          header="邀請旅伴加入"
          headerRight={
            !isOwner ? (
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                僅建立者可調整
              </span>
            ) : undefined
          }
          footer={memberError ? <span className="text-rose-600 dark:text-rose-400 font-semibold">{memberError}</span> : undefined}
        >
          <form onSubmit={handleAddMember} className="divide-y divide-[#E5E2DC]/75 dark:divide-slate-800/80">
            <div className="min-h-[48px] px-4 py-2 flex items-center gap-2.5">
              <UserPlus className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <input
                type="email"
                required
                disabled={!isOwner}
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (memberError) setMemberError(null);
                }}
                placeholder={lang === 'zh' ? '輸入旅伴 Google Email...' : 'Collaborator Email...'}
                className="flex-1 min-w-0 bg-transparent text-sm sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!isOwner || isActivating || !emailInput.trim()}
                className="min-h-[36px] px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                {isActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>新增</span>}
              </button>
            </div>
            {isOwner && (
              <div className="min-h-[44px] px-4 py-2 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">預設邀請權限</span>
                <div className="inline-flex rounded-xl bg-[#F3F1EC] dark:bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setRoleInput('editor')}
                    className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      roleInput === 'editor'
                        ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    可編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleInput('viewer')}
                    className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      roleInput === 'viewer'
                        ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    僅檢視
                  </button>
                </div>
              </div>
            )}
          </form>
        </IosInsetGroup>

        {/* Member List Group */}
        <IosInsetGroup header={`成員名單 (${currentMembers.length})`}>
          {currentMembers.map((member) => {
            const isMemberOwner = member.role === 'owner';
            const roleLabel = isMemberOwner ? '擁有者' : member.role === 'editor' ? '可編輯' : '僅檢視';

            if (isMemberOwner || !isOwner) {
              return (
                <IosRow
                  key={member.email}
                  icon={
                    <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold flex items-center justify-center text-xs">
                      {isMemberOwner ? (
                        <Crown className="w-4 h-4 text-amber-500" />
                      ) : (
                        (member.email?.[0] || '?').toUpperCase()
                      )}
                    </div>
                  }
                  label={member.email}
                  subtitle={isMemberOwner ? '擁有完整控制權' : member.role === 'editor' ? '可新增與修改所有日程' : '僅可查閱最新進度與天氣'}
                  trailing={
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {roleLabel}
                    </span>
                  }
                />
              );
            }

            const isExpanded = expandedMemberEmail === member.email;
            return (
              <IosDisclosureRow
                key={member.email}
                icon={
                  <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold flex items-center justify-center text-xs">
                    {(member.email?.[0] || '?').toUpperCase()}
                  </div>
                }
                label={member.email}
                subtitle={member.role === 'editor' ? '可新增與修改所有日程' : '僅可查閱最新進度與天氣'}
                value={roleLabel}
                valueAccent
                expanded={isExpanded}
                onToggle={() => setExpandedMemberEmail(isExpanded ? null : member.email)}
              >
                <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
                  <IosCheckmarkRow
                    inset
                    label="可編輯"
                    subtitle="可新增與修改所有日程與清單"
                    selected={member.role === 'editor'}
                    onSelect={() => handleChangeRole(member.email, 'editor')}
                  />
                  <IosCheckmarkRow
                    inset
                    label="僅檢視"
                    subtitle="僅可瀏覽最新進度與天氣"
                    selected={member.role === 'viewer'}
                    onSelect={() => handleChangeRole(member.email, 'viewer')}
                  />
                  <IosRow
                    icon={<Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
                    label="從行程移除此成員"
                    destructive
                    className="pl-11"
                    onClick={() => handleRemoveMember(member.email)}
                  />
                </div>
              </IosDisclosureRow>
            );
          })}
        </IosInsetGroup>

        {/* General Access Policy Group */}
        <IosInsetGroup header="連結存取權限" footer={currentAccessMeta.desc}>
          <IosDisclosureRow
            icon={<Globe className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="存取原則"
            value={currentAccessMeta.label}
            valueAccent
            disabled={!isOwner}
            expanded={showAccessPicker}
            onToggle={() => setShowAccessPicker((v) => !v)}
          >
            <div className="divide-y divide-[#E5E2DC]/70 dark:divide-slate-800/80">
              {GENERAL_ACCESS_OPTIONS.map((opt) => (
                <IosCheckmarkRow
                  key={opt.value}
                  inset
                  label={opt.label}
                  subtitle={opt.desc}
                  selected={(trip.generalAccess || 'link_viewer') === opt.value}
                  onSelect={() => void handleChangeGeneralAccess(opt.value)}
                />
              ))}
            </div>
          </IosDisclosureRow>
        </IosInsetGroup>

        {/* Invite Link & QR Group */}
        <IosInsetGroup header="共編邀請連結">
          <div className="px-4 py-3 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={collabUrl || '點擊右側產生共編連結'}
              className="flex-1 min-w-0 bg-transparent text-xs font-mono text-slate-700 dark:text-slate-200 outline-none select-all truncate"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="min-h-[36px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-xs font-bold flex items-center gap-1 shrink-0 transition cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已複製' : '複製連結'}</span>
            </button>
          </div>
          <IosRow
            icon={<Send className="w-4 h-4 text-teal-700 dark:text-teal-400" />}
            label="分享共編邀請給旅伴"
            onClick={handleNativeShare}
            trailing={<ChevronRight className="w-4 h-4 text-slate-400" />}
          />
          {collabUrl && (
            <IosDisclosureRow
              icon={<QrCode className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
              label="掃描 QR Code 加入共編"
              value={showQr ? '顯示中' : '展開'}
              expanded={showQr}
              onToggle={() => setShowQr((v) => !v)}
            >
              <div className="py-5 px-4 text-center space-y-2">
                <div className="inline-block p-3 rounded-2xl bg-white shadow-xs border border-[#E5E2DC]">
                  {qrSvg ? (
                    <svg
                      viewBox={`0 0 ${qrSvg.size} ${qrSvg.size}`}
                      className="w-32 h-32 mx-auto"
                      role="img"
                      aria-label="Collaborate Trip QR Code"
                    >
                      <rect width={qrSvg.size} height={qrSvg.size} fill="#ffffff" />
                      <path d={qrSvg.path} fill="#0f172a" />
                    </svg>
                  ) : (
                    <p className="text-xs text-slate-500 py-6 px-4">連結過長，請改用複製連結分享</p>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  本機安全生成 · 掃描 QR Code 立即加入共同編輯
                </p>
              </div>
            </IosDisclosureRow>
          )}
        </IosInsetGroup>
      </div>
    </IosModalSheet>
  );
};
