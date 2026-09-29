import React, { useId, useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeNumericInput } from '@/lib/numericInput';

export default function AccountLoginForm({ onLogin, loading, autoFocus = true }) {
  const inputId = useId();
  const [loginNumber, setLoginNumber] = useState('');
  const submit = (event) => { event.preventDefault(); if (!loading && loginNumber.trim()) onLogin(loginNumber.trim()); };
  return (
<form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <label htmlFor={inputId} className="block text-sm font-bold text-foreground">رقم الحساب</label>
            <div className="relative">
              <Input
                id={inputId}
                value={loginNumber}
                onChange={(event) => setLoginNumber(normalizeNumericInput(event.target.value))}
                type="tel"
                inputMode="numeric"
                pattern="[0-9٠-٩۰-۹]*"
                maxLength={20}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                autoFocus={autoFocus}
                placeholder="اكتب رقم الحساب"
                className="h-12 rounded-2xl pl-4 pr-11 text-right text-base font-bold"
              />
              <KeyRound className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#006b62]" />
            </div>
          </div>

          <Button variant="gradient" type="submit" disabled={loading || !loginNumber.trim()} loading={loading} className="h-12 w-full rounded-2xl text-base font-black text-white hover:text-white disabled:text-white">
            دخول
            <LogIn className="h-4 w-4" />
          </Button>
        </form>
  );
}
