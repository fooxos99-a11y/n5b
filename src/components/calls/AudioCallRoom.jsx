import AudioCallControls from './AudioCallControls';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, MonitorPlay, PhoneCall, User, X } from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Button } from '@/components/ui/button';
import IconActionButton from '@/components/ui/icon-action-button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const getScreenPublication = (participant) => (
  Array.from(participant?.trackPublications?.values?.() || []).find(
    (publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted,
  ) || null
);

const getCameraPublication = (participant) => (
  Array.from(participant?.trackPublications?.values?.() || []).find(
    (publication) => publication.source === Track.Source.Camera && !publication.isMuted,
  ) || null
);

const CameraVideo = ({ publication, isLocal }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const track = publication?.track;
    const container = containerRef.current;
    if (!track || !container) return undefined;
    const element = track.attach();
    element.autoplay = true;
    element.playsInline = true;
    element.muted = Boolean(isLocal);
    container.replaceChildren(element);
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [isLocal, publication?.track]);

  return (
    <div
      ref={containerRef}
      className={`aspect-video w-full overflow-hidden bg-black [&>video]:h-full [&>video]:w-full [&>video]:object-cover ${isLocal ? '[&>video]:-scale-x-100' : ''}`}
    />
  );
};

const canCaptureScreen = () => (
  typeof navigator !== 'undefined'
  && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
);

const isUnsupportedScreenShareError = (error) => (
  /getdisplaymedia.*not.*support|notsupported|not.?supported/i
    .test(`${error?.name || ''} ${error?.message || ''}`)
);

const getScreenShareErrorDescription = (error) => {
  const errorText = `${error?.name || ''} ${error?.message || ''}`;
  if (isUnsupportedScreenShareError(error)) {
    return 'متصفح الجوال لا يدعم بث الشاشة. يمكنك مشاهدة بث الآخرين من الجوال، ولإنشاء بث شاشة استخدم الكمبيوتر.';
  }
  if (/notallowed|permission|denied/i.test(errorText)) {
    return 'لم يتم السماح بمشاركة الشاشة. اسمح بالمشاركة من نافذة المتصفح ثم حاول مرة أخرى.';
  }
  if (/abort|cancel/i.test(errorText)) return 'تم إلغاء مشاركة الشاشة.';
  return 'تعذر بدء بث الشاشة. حاول مرة أخرى أو استخدم متصفحًا آخر.';
};

const AudioCallRoom = ({ roomInfo, isOwner, minimized = false, onRestore, onLeave, onClosed }) => {
  const { toast } = useToast();
  const livekitRoomRef = useRef(null);
  const audioContainerRef = useRef(null);
  const screenContainerRef = useRef(null);
  const activeScreenIdentityRef = useRef('');
  const [participants, setParticipants] = useState([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isTogglingCamera, setIsTogglingCamera] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [activeScreenShare, setActiveScreenShare] = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  const closeScreenShareView = useCallback(() => {
    activeScreenIdentityRef.current = '';
    screenContainerRef.current?.replaceChildren();
    setActiveScreenShare(null);
  }, []);

  useEffect(() => {
    if (minimized) closeScreenShareView();
  }, [closeScreenShareView, minimized]);

  const syncParticipants = useCallback(() => {
    const room = livekitRoomRef.current;
    if (!room) return;
    const toParticipant = (participant, isLocal) => {
      const cameraPublication = getCameraPublication(participant);
      return {
        identity: participant.identity,
        name: participant.name || (isLocal ? 'أنت' : 'مشارك'),
        isLocal,
        isMuted: !participant.isMicrophoneEnabled,
        isSpeaking: participant.isSpeaking,
        hasScreenShare: Boolean(getScreenPublication(participant)),
        cameraPublication,
      };
    };
    setParticipants([toParticipant(room.localParticipant, true), ...Array.from(room.remoteParticipants.values()).map((participant) => toParticipant(participant, false))]);
    setIsMuted(!room.localParticipant.isMicrophoneEnabled);
    setIsCameraEnabled(room.localParticipant.isCameraEnabled);
    setIsSharingScreen(room.localParticipant.isScreenShareEnabled);
  }, []);

  const showScreenShare = useCallback((identity) => {
    const room = livekitRoomRef.current;
    if (!room) return;
    const participant = room.localParticipant.identity === identity
      ? room.localParticipant
      : room.remoteParticipants.get(identity);
    const publication = getScreenPublication(participant);
    if (!participant || !publication) {
      toast({ title: 'البث غير متاح الآن', variant: 'destructive' });
      return;
    }

    activeScreenIdentityRef.current = identity;
    setActiveScreenShare({
      identity,
      name: participant.name || (participant === room.localParticipant ? 'أنت' : 'مشارك'),
    });
    screenContainerRef.current?.replaceChildren();
    if (publication.track && screenContainerRef.current) {
      screenContainerRef.current.appendChild(publication.track.attach());
    } else if (typeof publication.setSubscribed === 'function') {
      publication.setSubscribed(true);
    }
  }, [toast]);

  useEffect(() => {
    let mounted = true;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const audioContainer = audioContainerRef.current;
    const screenContainer = screenContainerRef.current;
    livekitRoomRef.current = room;
    const attachTrack = (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio && audioContainer) {
        const element = track.attach();
        element.autoplay = true;
        audioContainer.appendChild(element);
      }
      if (
        publication?.source === Track.Source.ScreenShare
        && activeScreenIdentityRef.current === participant?.identity
        && screenContainer
      ) {
        screenContainer.replaceChildren(track.attach());
      }
      syncParticipants();
    };
    const detachTrack = (track, publication, participant) => {
      track.detach().forEach((element) => element.remove());
      if (
        publication?.source === Track.Source.ScreenShare
        && activeScreenIdentityRef.current === participant?.identity
      ) closeScreenShareView();
      syncParticipants();
    };
    const participantDisconnected = (participant) => {
      if (activeScreenIdentityRef.current === participant.identity) closeScreenShareView();
      syncParticipants();
    };
    const publicationChanged = (publication, participant) => {
      if (
        publication?.source === Track.Source.ScreenShare
        && publication.isMuted
        && activeScreenIdentityRef.current === participant?.identity
      ) closeScreenShareView();
      syncParticipants();
    };
    const screenPublicationEnded = (publication, participant) => {
      if (
        publication?.source === Track.Source.ScreenShare
        && activeScreenIdentityRef.current === participant?.identity
      ) closeScreenShareView();
      syncParticipants();
    };
    const localPublicationEnded = (publication) => {
      if (
        publication?.source === Track.Source.ScreenShare
        && activeScreenIdentityRef.current === room.localParticipant.identity
      ) closeScreenShareView();
      syncParticipants();
    };
    room
      .on(RoomEvent.ParticipantConnected, syncParticipants)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
      .on(RoomEvent.TrackMuted, publicationChanged)
      .on(RoomEvent.TrackUnmuted, publicationChanged)
      .on(RoomEvent.TrackPublished, publicationChanged)
      .on(RoomEvent.TrackUnpublished, screenPublicationEnded)
      .on(RoomEvent.LocalTrackPublished, syncParticipants)
      .on(RoomEvent.LocalTrackUnpublished, localPublicationEnded)
      .on(RoomEvent.TrackSubscribed, attachTrack)
      .on(RoomEvent.TrackUnsubscribed, detachTrack);

    const connect = async () => {
      try {
        const credentials = await studentsApi.getCallToken(roomInfo.id);
        await room.connect(credentials.serverUrl, credentials.token, { autoSubscribe: true });
        if (mounted) syncParticipants();
      } catch (error) {
        console.error('LiveKit room connection failed', error);
        toast({ title: 'تعذر دخول المكالمة', description: 'تعذر الاتصال بالغرفة الصوتية. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.', variant: 'destructive' });
        onLeave();
      } finally {
        if (mounted) setIsConnecting(false);
      }
    };
    connect();
    return () => {
      mounted = false;
      room.disconnect();
      livekitRoomRef.current = null;
      activeScreenIdentityRef.current = '';
      audioContainer?.replaceChildren();
      screenContainer?.replaceChildren();
    };
  }, [closeScreenShareView, onLeave, roomInfo.id, syncParticipants, toast]);

  const toggleMicrophone = async () => {
    try {
      await livekitRoomRef.current?.localParticipant.setMicrophoneEnabled(isMuted);
      syncParticipants();
    } catch (error) {
      const permissionDenied = /permission|denied|notallowed/i.test(String(error?.name || error?.message || ''));
      toast({
        title: 'تعذر فتح الميكروفون',
        description: permissionDenied ? 'اسمح للمتصفح باستخدام الميكروفون من إعدادات الموقع ثم حاول مرة أخرى.' : error.message,
        variant: 'destructive',
      });
    }
  };

  const toggleCamera = async () => {
    setIsTogglingCamera(true);
    try {
      const localParticipant = livekitRoomRef.current?.localParticipant;
      if (!localParticipant) return;
      await localParticipant.setCameraEnabled(
        !isCameraEnabled,
        !isCameraEnabled ? { facingMode: 'user' } : undefined,
      );
      syncParticipants();
    } catch (error) {
      const permissionDenied = /permission|denied|notallowed/i.test(`${error?.name || ''} ${error?.message || ''}`);
      const unavailable = /notfound|devicesnotfound|overconstrained/i.test(`${error?.name || ''} ${error?.message || ''}`);
      const _resolveDescription = () => {
        if (permissionDenied) {
          return 'اسمح للمتصفح باستخدام الكاميرا من إعدادات الموقع ثم حاول مرة أخرى.';
        }
        if (unavailable) {
          return 'لم يتم العثور على كاميرا متاحة في هذا الجهاز.';
        }
        return error.message || 'تعذر تشغيل الكاميرا. حاول مرة أخرى.';
      };
      toast({
        title: 'تعذر فتح الكاميرا',
        description: _resolveDescription(),
        variant: 'destructive',
      });
    } finally {
      setIsTogglingCamera(false);
    }
  };

  const toggleScreenShare = async () => {
    if (!canCaptureScreen()) {
      toast({
        title: 'بث الشاشة غير متاح على هذا الجوال',
        description: getScreenShareErrorDescription({ name: 'GetDisplayMediaNotSupported' }),
      });
      return;
    }
    try {
      const localParticipant = livekitRoomRef.current?.localParticipant;
      if (!localParticipant) return;
      const nextEnabled = !isSharingScreen;
      await localParticipant.setScreenShareEnabled(nextEnabled, { audio: false });
      syncParticipants();
      if (!nextEnabled && activeScreenIdentityRef.current === localParticipant.identity) closeScreenShareView();
    } catch (error) {
      toast({
        title: isUnsupportedScreenShareError(error) ? 'بث الشاشة غير متاح على هذا الجوال' : 'تعذر مشاركة الشاشة',
        description: getScreenShareErrorDescription(error),
        variant: isUnsupportedScreenShareError(error) ? undefined : 'destructive',
      });
    }
  };

  const leave = async () => { livekitRoomRef.current?.disconnect(); await studentsApi.leaveCallRoom(roomInfo.id).catch(() => {}); onLeave(); };
  const closeRoom = async () => {
    setIsClosing(true);
    try { await studentsApi.closeCallRoom(roomInfo.id); livekitRoomRef.current?.disconnect(); onClosed(); }
    catch (error) { toast({ title: 'تعذر إغلاق الغرفة', description: error.message, variant: 'destructive' }); }
    finally { setIsClosing(false); }
  };

  if (isConnecting) {
    if (minimized) {
      return (
        <button type="button" onClick={onRestore} className="fixed bottom-3 left-3 z-[60] flex w-[min(88vw,320px)] items-center gap-3 rounded-2xl border border-primary/30 bg-card/95 p-3 text-right shadow-2xl shadow-primary/20 backdrop-blur-xl sm:bottom-5 sm:left-5" dir="rtl">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><PhoneCall className="h-5 w-5 animate-pulse" /></span>
          <span className="min-w-0"><span className="block truncate font-black text-foreground">{roomInfo.name}</span><span className="block text-xs font-bold text-muted-foreground">جاري الاتصال بالمكالمة...</span></span>
        </button>
      );
    }
    return <DashboardLoader className="min-h-[420px]" />;
  }

  if (minimized) {
    return (
      <>
        <button
          type="button"
          onClick={onRestore}
          className="fixed bottom-3 left-3 z-[60] flex w-[min(88vw,340px)] items-center gap-3 rounded-2xl border border-primary/35 bg-card/95 p-3 text-right shadow-2xl shadow-primary/20 backdrop-blur-xl transition hover:border-primary/60 hover:bg-card sm:bottom-5 sm:left-5"
          aria-label={`العودة إلى المكالمة ${roomInfo.name}`}
          dir="rtl"
        >
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
            <PhoneCall className="relative h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-black text-foreground">{roomInfo.name}</span>
            <span className="mt-0.5 block text-xs font-bold text-primary">المكالمة مستمرة · {participants.length} مشارك</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            {isMuted ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-primary" />}
            {isCameraEnabled ? <Camera className="h-4 w-4 text-primary" /> : <CameraOff className="h-4 w-4" />}
          </span>
        </button>
        <div ref={audioContainerRef} className="hidden" aria-hidden="true" />
      </>
    );
  }

  return (
    <>
      <Card className="border-primary/30 bg-card neon-glow" dir="rtl">
      <CardHeader className="gap-4 border-b border-primary/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black text-foreground sm:text-2xl">{roomInfo.name}</h2>
          <AudioCallControls isMuted={isMuted} isCameraEnabled={isCameraEnabled} isSharingScreen={isSharingScreen} isTogglingCamera={isTogglingCamera} isOwner={isOwner || roomInfo.canClose} isClosing={isClosing} toggleMicrophone={toggleMicrophone} toggleCamera={toggleCamera} toggleScreenShare={toggleScreenShare} leave={leave} closeRoom={closeRoom} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-4 sm:pt-6">
        <div className={activeScreenShare ? 'overflow-hidden rounded-lg border border-primary/20 bg-black' : 'hidden'}>
          <div className="flex items-center justify-between bg-background/95 px-3 py-2 text-sm font-black text-foreground">
            <span className="truncate">بث {activeScreenShare?.name}</span>
            <IconActionButton label="إغلاق عرض البث" variant="ghost" onClick={closeScreenShareView} className="h-11 w-11 shrink-0">
              <X className="h-4 w-4" />
            </IconActionButton>
          </div>
          <div ref={screenContainerRef} className="flex aspect-video w-full items-center justify-center overflow-hidden bg-black [&>video]:h-full [&>video]:w-full [&>video]:object-contain" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((participant) => (
            <Card key={participant.identity} className={`overflow-hidden border-primary/15 bg-background/60 ${participant.isSpeaking ? 'ring-2 ring-primary' : ''}`}>
              {participant.cameraPublication ? (
                <CameraVideo publication={participant.cameraPublication} isLocal={participant.isLocal} />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-primary/5">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><User className="h-6 w-6" /></span>
                </div>
              )}
              <CardContent className="flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center">
                <div className="flex min-w-0 max-w-full items-center justify-center gap-2">
                  <div className="truncate font-black text-foreground">{participant.name}</div>
                  {participant.hasScreenShare && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => showScreenShare(participant.identity)} className="h-7 shrink-0 gap-1 px-2 text-xs text-primary" aria-label={`مشاهدة بث ${participant.name}`}>
                      <MonitorPlay className="h-3.5 w-3.5" />
                      بث
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
                  <span>{participant.isLocal ? 'أنت' : 'متصل'}</span>
                  {participant.isMuted ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-primary" />}
                  {participant.cameraPublication ? <Camera className="h-4 w-4 text-primary" /> : <CameraOff className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
      </Card>
      <div ref={audioContainerRef} className="hidden" aria-hidden="true" />
    </>
  );
};

export default AudioCallRoom;
