import React from 'react';
import { IosActionSheet } from '../UI/IosPrimitives';

interface DeleteConfirmModalProps {
  tripTitle: string;
  isLastTrip: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  tripTitle,
  isLastTrip,
  onConfirm,
  onClose,
}) => {
  if (isLastTrip) {
    return (
      <IosActionSheet
        title="無法刪除最後一個行程"
        message="系統至少需保留一個旅遊行程。您可以直接「編輯此行程」修改內容，或先建立新行程後再刪除此行程。"
        options={[]}
        cancelLabel="我知道了"
        onClose={onClose}
        zIndexClass="z-[90]"
      />
    );
  }

  return (
    <IosActionSheet
      title={`刪除「${tripTitle}」？`}
      message="此旅程將從本機與雲端同步刪除，包含所有排程、照片索引與記帳紀錄，且無法復原。"
      options={[
        {
          label: '確認刪除旅程',
          tone: 'destructive',
          onClick: () => {
            onConfirm();
            onClose();
          },
        },
      ]}
      cancelLabel="取消"
      onClose={onClose}
      zIndexClass="z-[90]"
    />
  );
};
