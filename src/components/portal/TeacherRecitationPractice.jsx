import React from 'react';

export default function TeacherRecitationPractice({ repeatControl, listeningControl }) {
  if (!repeatControl && !listeningControl) return null;
  return (
    <div className="recitation-practice" dir="rtl">
      {repeatControl && <div><span>التكرار:</span>{repeatControl}</div>}
      {listeningControl && <div><span>الاستماع:</span>{listeningControl}</div>}
    </div>
  );
}
