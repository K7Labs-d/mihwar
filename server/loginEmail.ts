export function createLoginEmailSender(apiKey: string, from: string) {
  if (!apiKey || !from || /[\r\n]/.test(from)) throw new Error('RESEND_API_KEY and LOGIN_EMAIL_FROM are required.');
  return async (to: string, code: string): Promise<void> => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'رمز الدخول إلى محور',
        text: `رمز الدخول إلى محور: ${code}\nصالح لمدة 5 دقائق. إذا لم تطلب تسجيل الدخول، تجاهل هذه الرسالة.` }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Login email delivery failed.');
  };
}
