import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentHomeHeader from '../../src/components/portal/home/StudentHomeHeader';
import { applyTheme, getPreferredThemeForPath } from '../../src/lib/theme';
import '../../src/index.css';
import '../../src/components/portal/home/student-home.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
applyTheme(getPreferredThemeForPath(location.pathname));
createRoot(document.getElementById('root')).render(<main className="student-home" dir="rtl">
  <StudentHomeHeader points={250} progress={40} onOpen={() => {}} onLogout={() => {}} />
  <div className="student-home-main">
    <section className="student-home-today"><div className="student-home-section-head"><h1>خطة اليوم</h1><strong>٤٠٪</strong></div>
      <div className="student-home-task-grid">{['الحفظ','المراجعة','الربط'].map(label => <div className="student-home-execution-task" key={label}><button className="student-home-task"><span>{label}</span><small>سورة الصف ١–٤</small></button></div>)}</div>
    </section>
    <section className="student-home-rankings"><h2>ترتيب الطلاب</h2><ol className="student-home-rank-list">
      <li data-rank="1"><span className="student-home-rank-medal">١</span><span className="student-home-rank-name"><strong>طالب اختبار</strong><small>الحلقة</small></span><span className="student-rank-points">٢٥٠</span></li>
      <li data-self="true"><span className="student-home-rank-medal">٢</span><span className="student-home-rank-name"><strong>طالب آخر</strong><small>الحلقة</small></span><span className="student-rank-points">٢٠٠</span></li>
    </ol></section>
  </div>
</main>);
