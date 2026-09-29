import React, { useId, useState } from 'react';
import { Contact, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import { normalizeNumericInput } from '@/lib/numericInput';
import LoginHelpDialog from './LoginHelpDialog';
import './account-login.css';

export default function AccountLoginForm({ onLogin, loading, autoFocus = true }) {
  const inputId = useId();
  const [loginNumber, setLoginNumber] = useState('');
  const [password, setPassword] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    if (!loading && loginNumber.trim()) onLogin(loginNumber.trim(), password);
  };
  const submitOnEnter = (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!event.repeat) event.currentTarget.form?.requestSubmit();
  };
  return <>
    <form className="account-login-form" onSubmit={submit}>
      <label htmlFor={inputId} className="account-login-label">رقم الدخول <span aria-hidden="true" className="account-login-required">*</span></label>
      <div className="relative">
        <Input id={inputId} aria-label="رقم الدخول" value={loginNumber} required
          onChange={(event) => setLoginNumber(normalizeNumericInput(event.target.value))}
          onKeyDown={submitOnEnter} type="tel" inputMode="numeric" pattern="[0-9٠-٩۰-۹]*"
          maxLength={80} autoComplete="username" autoCapitalize="none" spellCheck={false}
          enterKeyHint="next" autoFocus={autoFocus} placeholder="أدخل رقم الدخول" className="account-login-input" />
        <span className="account-login-input-icon" aria-hidden="true"><Contact className="h-6 w-6" /></span>
      </div>
      <div className="mt-6">
        <label htmlFor={`${inputId}-password`} className="account-login-label">كلمة المرور <span aria-hidden="true" className="account-login-required">*</span></label>
        <PasswordInput id={`${inputId}-password`} aria-label="كلمة المرور" value={password} onChange={(event) => setPassword(event.target.value)}
          onKeyDown={submitOnEnter} autoComplete="current-password" enterKeyHint="done"
          placeholder="أدخل كلمة المرور" className="account-login-input" />
      </div>
      <Button type="button" variant="link" className="account-login-forgot" onClick={() => setHelpOpen(true)}>هل نسيت كلمة المرور؟</Button>
      <Button type="submit" disabled={loading || !loginNumber.trim()} loading={loading} className="account-login-submit">تسجيل دخول</Button>
      <Button asChild variant="link" className="account-login-contact">
        <a href="https://wa.me/05" target="_blank" rel="noopener noreferrer">للتواصل اضغط هنا <ExternalLink className="h-5 w-5" aria-hidden="true" /></a>
      </Button>
    </form>
    <LoginHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
  </>;
}
