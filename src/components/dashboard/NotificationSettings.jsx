import React from 'react';
import SettingsGroup from './SettingsGroup';
import MessageTemplateField, { TemplateVariablesHint } from './MessageTemplateField';
import { ToggleSwitch } from '@/components/ui/setting-toggle';

export default function NotificationSettings({settings,setSettings}) {
  return <>
          <SettingsGroup>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-primary">قوالب الغياب</h3>
              <TemplateVariablesHint />
            </div>
            <div className="space-y-5">
              <MessageTemplateField
                id="attendance-absent-template"
                label="قالب رسالة الغياب"
                value={settings.attendanceAbsentTemplate || ''}
                onChange={(value) => setSettings({ ...settings, attendanceAbsentTemplate: value })}
                placeholder="استخدم {name} و {date} و {committee}"
                action={(
                  <ToggleSwitch
                    ariaLabel="الإرسال التلقائي لرسالة الغياب"
                    checked={settings.automaticAbsenceMessageEnabled}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      automaticAbsenceMessageEnabled: checked,
                    })}
                  />
                )}
              />

            </div>
          </SettingsGroup>
          <SettingsGroup>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-primary">قوالب يوم السرد</h3>
              <TemplateVariablesHint />
            </div>
            <div className="space-y-5">
              <MessageTemplateField id="narration-start-template" label="قالب بداية يوم السرد" value={settings.narrationStartTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationStartTemplate: value })} />
              <MessageTemplateField id="narration-end-template" label="قالب نهاية يوم السرد" value={settings.narrationEndTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationEndTemplate: value })} />
              <MessageTemplateField id="narration-result-template" label="قالب نتيجة يوم السرد" value={settings.narrationResultTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationResultTemplate: value })} />
            </div>
          </SettingsGroup>
    <SettingsGroup><h3 className="text-sm font-black text-primary">قوالب التسجيل</h3>
    {[
      ['registrationPreAcceptTemplate','القبول المبدئي'],['registrationAcceptTemplate','قبول التسجيل'],['registrationRejectTemplate','رفض التسجيل'],
    ].map(([key,label])=><MessageTemplateField key={key} id={key} label={label} value={settings[key]||''} onChange={value=>setSettings({...settings,[key]:value})}/>)}
    </SettingsGroup>

  </>;
}
