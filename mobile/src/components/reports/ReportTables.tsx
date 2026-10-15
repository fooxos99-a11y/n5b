import { View } from 'react-native';
import { AppText } from '../AppText';
import { SectionCard, screenStyles } from '../ScreenLayout';
import { usePalette } from '../../theme';
import type { ReportDetailRow, ReportTable } from '../../domain/reportManagement';
import { reportRowSections, reportValueSection, type ReportFieldSection } from './reportDetails';

function ReportFieldRows({section}:{section:ReportFieldSection}) {
  return section.children ? <View style={{gap:6}}><AppText style={screenStyles.bold}>{section.label}</AppText>{section.children.map((child,index)=><ReportFieldRows key={index} section={child}/>)}</View>
    : <AppText>{section.label}: {section.value}</AppText>;
}
function ReaderRows({rows}:{rows:readonly ReportDetailRow[]}){
  const palette=usePalette();
  return <>{rows.length?rows.map((row,index)=><View key={String(row.id??row.studentId??index)+'-'+index} style={[screenStyles.row,{borderColor:palette.border}]}>
    <AppText style={screenStyles.bold}>{row.studentName??row.name??'سجل'}</AppText>{!!row.committeeName&&<AppText>{row.committeeName}</AppText>}
    {reportRowSections(row).map((section,sectionIndex)=><ReportFieldRows key={sectionIndex} section={section}/>)}
  </View>):<AppText>لا توجد سجلات في هذه الفترة.</AppText>}</>;
}
export function ReportDetailTable({report,title}:{report:ReportTable;title:string}){
  const totals=report.totals?reportValueSection(report.totals,'المجاميع'):null;
  return <SectionCard title={title}>
    {typeof report.effectiveDate==='string'?<AppText>يوم التحضير المعروض: {report.effectiveDate}{typeof report.requestedDate==='string'&&report.requestedDate!==report.effectiveDate?'، اليوم المطلوب: '+report.requestedDate:''}</AppText>
      :report.period&&<AppText>الفترة: {report.period.from} — {report.period.to}</AppText>}
    {report.period&&'mode' in report.period&&report.period.mode==='allTime'&&<AppText>هذا سجل المحفوظ الكامل المتاح.</AppText>}
    {totals&&<ReportFieldRows section={totals}/>}<ReaderRows rows={report.rows}/>
    {!!report.compensations?.length&&<SectionCard title="التعويضات"><ReaderRows rows={report.compensations}/></SectionCard>}
  </SectionCard>;
}
