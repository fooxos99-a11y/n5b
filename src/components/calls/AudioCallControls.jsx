import React from 'react';
import { Camera, CameraOff, LogOut, Mic, MicOff, MonitorUp, PhoneOff, ScreenShareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import IconActionButton from '@/components/ui/icon-action-button';

/** Render the existing controls with their accessible labels and responsive layout. */
export default function AudioCallControls({ isMuted, isCameraEnabled, isSharingScreen, isTogglingCamera, isOwner, isClosing, toggleMicrophone, toggleCamera, toggleScreenShare, leave, closeRoom }) {
 return (<div className="flex flex-wrap items-center gap-2">
            <IconActionButton label={isMuted ? 'فتح الميكروفون' : 'كتم الميكروفون'} variant={isMuted ? 'destructive' : 'outline'} onClick={toggleMicrophone}>
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </IconActionButton>
            <IconActionButton label={isCameraEnabled ? 'إيقاف الكاميرا' : 'فتح الكاميرا'} variant={isCameraEnabled ? 'default' : 'outline'} onClick={toggleCamera} disabled={isTogglingCamera}>
              {isCameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            </IconActionButton>
            <IconActionButton label={isSharingScreen ? 'إيقاف مشاركة الشاشة' : 'مشاركة الشاشة'} variant={isSharingScreen ? 'default' : 'outline'} onClick={toggleScreenShare}>
              {isSharingScreen ? <ScreenShareOff className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
            </IconActionButton>
            <IconActionButton label="الخروج من المكالمة" variant="outline" onClick={leave}>
              <LogOut className="h-4 w-4" />
            </IconActionButton>
            {isOwner && <Button variant="destructive" onClick={closeRoom} disabled={isClosing} className="gap-2"><PhoneOff className="h-4 w-4" /> إغلاق الغرفة</Button>}
          </div>);
}
