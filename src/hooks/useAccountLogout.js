import { useNavigate } from '@/lib/router';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

export function useAccountLogout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  return () => {
    const completion = studentsApi.logout();
    navigate('/login', { replace: true });
    void completion.catch(() => toast({
      title: 'خرجت من الحساب على هذا الجهاز',
      description: 'تعذر تأكيد إغلاق الجلسة على الخادم. تحقق من الاتصال.',
      variant: 'destructive',
    }));
  };
}
