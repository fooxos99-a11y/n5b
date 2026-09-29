import React from 'react';
import PublicInfoLayout from '@/components/legal/PublicInfoLayout';

const Section = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-black text-foreground">{title}</h2>
    <div className="text-muted-foreground">{children}</div>
  </section>
);

const PrivacyPolicy = () => {
  return (
  <PublicInfoLayout title="سياسة الخصوصية" showSiteName={false}>
    <p className="text-muted-foreground">آخر تحديث: 24 يوليو 2026</p>

    <Section title="البيانات التي نعالجها">
      <p>نعالج بيانات التسجيل والحساب مثل الاسم ورقم الدخول ورقم الهوية والعمر ووسيلة تواصل ولي الأمر، إضافة إلى بيانات الحضور والخطط والتسميع والجلسات والتقارير. وقد تُستخدم الكاميرا والميكروفون والموقع عند تشغيل ميزة تتطلبها وبعد موافقة الجهاز.</p>
    </Section>

    <Section title="سبب الاستخدام">
      <p>تُستخدم البيانات لتشغيل خدمات منصة نخب، إدارة الحسابات والحضور والخطط والتقييمات، تمكين التواصل، حماية الحسابات، وتحسين موثوقية الخدمة.</p>
    </Section>

    <Section title="المشاركة والحفظ">
      <p>لا نبيع البيانات الشخصية. تقتصر المعالجة على إدارة نخب ومزودي البنية التقنية اللازمين لتشغيل الخدمة، مع تطبيق ضوابط وصول مناسبة. تُحفظ البيانات للمدة اللازمة للتشغيل والالتزامات النظامية، ثم تُحذف أو تُجرد من الهوية.</p>
    </Section>

    <Section title="حذف الحساب">
      <p>يمكن للمستخدم تقديم طلب حذف الحساب من قائمة حساب الطالب داخل التطبيق أو رابط «طلب حذف الحساب» في تذييل الصفحة الرئيسية، ثم تسجيل الدخول عند الطلب. تظهر حالة الطلب داخل حسابه، ويمكن إلغاؤه قبل بدء المعالجة. يعالج مدير نخب الطلب والبيانات المرتبطة به خلال مدة لا تتجاوز 30 يوماً، مع استثناء ما يلزم الاحتفاظ به نظامياً.</p>
    </Section>
  </PublicInfoLayout>
  );
};

export default PrivacyPolicy;
