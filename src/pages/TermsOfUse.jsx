import React from 'react';
import PublicInfoLayout from '@/components/legal/PublicInfoLayout';
import { useSiteConfig } from '@/site/SiteProvider';

const Section = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-black text-foreground">{title}</h2>
    <div className="text-muted-foreground">{children}</div>
  </section>
);

const TermsOfUse = () => {
  const site = useSiteConfig();
  return (
  <PublicInfoLayout title="شروط الاستخدام" showSiteName={false}>
    <p className="text-muted-foreground">آخر تحديث: 3 أغسطس 2026</p>

    <Section title="قبول الشروط">
      <p>باستخدام {site.name} أو تسجيل الدخول إليه فإنك توافق على هذه الشروط وسياسة الخصوصية. إذا كنت طالبًا قاصرًا، فيكون استخدام الحساب تحت إشراف ولي الأمر وإدارة نخب.</p>
    </Section>

    <Section title="الحساب">
      <p>يلتزم المستخدم بتقديم بيانات صحيحة، والمحافظة على سرية رقم الدخول، وعدم مشاركة حسابه أو استخدام حساب شخص آخر. يجب إبلاغ إدارة نخب عند الاشتباه في استخدام غير مصرح به.</p>
    </Section>

    <Section title="الاستخدام المقبول">
      <p>تُستخدم الخدمة للأغراض التعليمية والإدارية الخاصة بنخب. يُمنع إساءة استخدام المنصة، أو محاولة تجاوز الصلاحيات، أو تعطيل الخدمة، أو رفع محتوى ضار أو مخالف.</p>
    </Section>

    <Section title="المحتوى والنتائج">
      <p>تُسجل بيانات الحضور والخطط والتسميع والتقييم والتنفيذ وفق صلاحيات نخب. تقع مسؤولية مراجعة دقة البيانات التعليمية واتخاذ القرارات المرتبطة بها على الجهات المخولة في نخب.</p>
    </Section>

    <Section title="توفر الخدمة">
      <p>نسعى إلى إبقاء الخدمة متاحة وآمنة، وقد تتوقف مؤقتًا للصيانة أو لمعالجة خلل تقني. قد تتغير بعض المزايا عند الحاجة إلى تحسين الخدمة أو حماية المستخدمين.</p>
    </Section>

    <Section title="تعليق الحساب أو حذفه">
      <p>يجوز تقييد الحساب عند مخالفة هذه الشروط أو وجود خطر أمني. ويمكن للمستخدم تقديم طلب حذف الحساب من قائمة حساب الطالب أو أسفل الصفحة الرئيسية، ويُعالج الطلب وفق سياسة الخصوصية.</p>
    </Section>
  </PublicInfoLayout>
  );
};

export default TermsOfUse;
