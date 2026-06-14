import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, ExternalLink, AlertTriangle, CheckCircle, HelpCircle, ArrowRight, Loader2, Info } from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export default function AdminLoginModal({ isOpen, onClose, lang }: AdminLoginModalProps) {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail } = useFirebase();
  
  const [email, setEmail] = useState('itegy73@gmail.com');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfigGuide, setShowConfigGuide] = useState(false);
  
  // Detect if app is currently nested in an iframe
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsIframe(window.self !== window.top);
    }
  }, []);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup')) {
        setErrorMessage(
          lang === 'ar'
            ? 'تم حظر النافذة المنبثقة من قبل المتصفح. يرجى فتح التطبيق في تبويب مستقل من الزر أعلاه لتسجيل الدخول بنجاح.'
            : 'The browser blocked the login popup. Please open the app in a new tab using the button above to login successfully.'
        );
      } else {
        setErrorMessage(err?.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please input email and password');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (isSignUpMode) {
        await signUpWithEmail(email, password);
        setSuccessMessage(
          lang === 'ar'
            ? 'تم إنشاء الحساب بنجاح! إذا طلب النظام تفعيلاً، يرجى مراجعة بريدك الإلكتروني.'
            : 'Account registered successfully!'
        );
        setIsSignUpMode(false);
      } else {
        await loginWithEmail(email, password);
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = err?.message || 'Authentication failed';
      
      // User-friendly error messages translation
      if (err?.code === 'auth/user-not-found' || errMsg.includes('user-not-found')) {
        errMsg = lang === 'ar' 
          ? 'المستخدم غير موجود. يرجى تفعيل خيار "إنشاء حساب مسؤول جديد" بالأسفل للتسجيل أولاً.' 
          : 'User not found. Try activating the Signup option below.';
      } else if (err?.code === 'auth/wrong-password' || errMsg.includes('wrong-password') || errMsg.includes('invalid-credential')) {
        errMsg = lang === 'ar'
          ? 'كلمة المرور غير صحيحة أو البريد غير مسجل. يرجى التأكد والمحاولة مجدداً.'
          : 'Invalid credentials. Please verify your email & password.';
      } else if (err?.code === 'auth/operation-not-allowed' || errMsg.includes('operation-not-allowed')) {
        errMsg = lang === 'ar'
          ? 'تسجيل الدخول بالبريد الإلكتروني غير مفعل في Firebase حالياً. يرجى مراجعة دليل التفعيل بالأسفل.'
          : 'Email/Password sign-in is not enabled in Firebase Auth Console yet. Check the guide below.';
      } else if (err?.code === 'auth/weak-password') {
        errMsg = lang === 'ar' ? 'كلمة المرور ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل)' : 'Password too weak (at least 6 characters)';
      } else if (err?.code === 'auth/email-already-in-use') {
        errMsg = lang === 'ar' ? 'هذا البريد مسجل بالفعل، يرجى تسجيل الدخول مباشرة.' : 'Email already in use. Please sign in instead.';
      }
      
      setErrorMessage(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl overflow-y-auto max-h-[90vh] text-right"
        style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}
      >
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white bg-slate-800/65 hover:bg-slate-750 rounded-xl transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* HEADER */}
        <div className="mb-5 text-center sm:text-right pt-2">
          <h2 className="text-lg font-black text-white flex items-center justify-center sm:justify-start gap-2">
            🔑 {lang === 'ar' ? 'بوابة تسجيل دخول المدير والمسؤول' : 'Admin Auth Control'}
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">
            {lang === 'ar'
              ? 'يرجى تسجيل الدخول لتتمكن من إضافة وتعديل وتحريك دبابيس ومباني المنتجع بحرية مطلقة.'
              : 'Sign in to configure map coords, append, delete, or displace resort structures.'}
          </p>
        </div>

        {/* IFRAME CRITICAL EXPLANATION & NEW TAB Launch (The ultimate fix) */}
        {isIframe && (
          <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3">
            <div className="flex items-start gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong className="text-xs block font-black">
                  {lang === 'ar' ? '⚠️ تنبيه أمان متصفحات المعاينة (Iframe)' : '⚠️ Sandbox Iframe Security Alert'}
                </strong>
                <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">
                  {lang === 'ar'
                    ? 'بسبب ميزات الحماية في المتصفح، تمنع نافذة المعاينة (iframe) النوافذ المنبثقة من التواصل، ولذا فإن تسجيل دخول Google يفتح ويغلق فورًا دون أثر.'
                    : 'Security configurations block Auth popups within active developer preview window frames, failing instant popup exchanges.'}
                </p>
              </div>
            </div>

            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>🚀 {lang === 'ar' ? 'تشغيل التطبيق في نافذة مستقلة' : 'Open in New Tab'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span className="text-[9.5px] text-slate-400 flex items-center justify-center font-bold text-center">
                {lang === 'ar' ? '(الحل الأضمن لتسجيل الدخول بجوجل بنجاح 💯)' : '(Safe Google Auth works seamlessly here 💯)'}
              </span>
            </div>
          </div>
        )}

        {/* ERROR MESSAGES POOL */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-xl text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-sans">{errorMessage}</span>
          </div>
        )}

        {/* SUCCESS MESSAGES POOL */}
        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-950/25 border border-emerald-900/35 text-emerald-400 rounded-xl text-xs flex items-start gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-sans">{successMessage}</span>
          </div>
        )}

        {/* OPTION 1: GOOGLE SIGN IN */}
        <div className="mb-5">
          <label className="text-[10px] text-slate-400 block mb-2 font-black uppercase tracking-wider">
            {lang === 'ar' ? 'الخيار الأول: تسجيل الدخول السريع' : 'Option 1: Quick Google Login'}
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 rounded-xl text-xs font-black flex items-center justify-center gap-2.5 transition active:scale-[0.98] disabled:opacity-55"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-3.3-4.53-6.16-4.53z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>{lang === 'ar' ? 'دخول فوري بحساب Google' : 'Sign in with Google Account'}</span>
          </button>
        </div>

        {/* OR DIVIDER */}
        <div className="relative my-4 text-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
          <span className="relative px-3 text-[10px] text-slate-500 bg-slate-900 font-bold">
            {lang === 'ar' ? 'أو (بديل ممتاز لبيئة iframe)' : 'OR (Best Alternative for Iframe)'}
          </span>
        </div>

        {/* OPTION 2: EMAIL AND PASSWORD (POPUP-FREE) */}
        <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
          <label className="text-[10px] text-slate-400 block mb-1 font-black uppercase tracking-wider">
            {lang === 'ar' ? 'الخيار الثاني: البريد الإلكتروني (بدون نوافذ منبثقة)' : 'Option 2: Email & Password (no popups)'}
          </label>

          <div className="relative">
            <span className="absolute inset-y-0 right-3.5 flex items-center text-slate-500">
              <Mail className="w-4 h-4" />
            </span>
            <input
              type="email"
              placeholder={lang === 'ar' ? 'البريد الإلكتروني (مثال: itegy73@gmail.com)' : 'Admin Email'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full pr-10 pl-4 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none transition"
              required
            />
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 right-3.5 flex items-center text-slate-500">
              <Lock className="w-4 h-4" />
            </span>
            <input
              type="password"
              placeholder={lang === 'ar' ? 'كلمة المرور' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full pr-10 pl-4 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none transition animate-none"
              minLength={6}
              required
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setIsSignUpMode(prev => !prev)}
              className="text-[10.5px] text-amber-500/80 hover:text-amber-400 font-sans transition hover:underline"
            >
              {isSignUpMode
                ? (lang === 'ar' ? '← العودة لتسجيل الدخول المباشر' : '← Back to Direct Sign In')
                : (lang === 'ar' ? '🆕 إنشاء حساب مسؤول برقم سري لأول مرة؟' : '🆕 Create a new admin password key?')}
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />}
              <span>
                {isSignUpMode
                  ? (lang === 'ar' ? 'إنشاء حساب جديد كمسؤول' : 'Register Account')
                  : (lang === 'ar' ? 'تسجيل دخول بالرقم السري' : 'Direct Passcode Sign In')}
              </span>
            </button>
          </div>
        </form>

        {/* HOW TO ENABLE GUIDE ACCORDION */}
        <div className="mt-6 pt-4 border-t border-slate-850">
          <button
            type="button"
            onClick={() => setShowConfigGuide(prev => !prev)}
            className="w-full flex items-center justify-between p-2.5 bg-slate-950/40 rounded-xl hover:bg-slate-950 transition text-[10.5px] font-black text-amber-400"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{lang === 'ar' ? '🛠️ المساعدة: خطوتان لتنشيط الدخول بالبريد الإلكتروني' : '🛠️ Guide: Enable Email Provider in Console'}</span>
            </span>
            <span>{showConfigGuide ? '▲' : '▼'}</span>
          </button>

          {showConfigGuide && (
            <div className="mt-3 p-3.5 bg-slate-950 border border-slate-900 rounded-xl space-y-3.5 text-[10px] text-slate-300 leading-normal animate-scale-up">
              <p className="font-bold text-slate-400">
                {lang === 'ar'
                  ? 'إذا واجهت خطأ (Operation not allowed / غير مسموح بهذه العملية)، يرجى تنشيط خيار البريد في لوحة تحكم Firebase خطوة بخطوة:'
                  : 'If you encounter an "Operation not allowed" error on Email Sign-In, please enable the provider in your Firebase project console:'}
              </p>
              
              <ol className="list-decimal list-inside space-y-2 font-sans text-slate-300 pr-2">
                <li>
                  {lang === 'ar' ? 'اذهب إلى ' : 'Go to '}
                  <a 
                    href="https://console.firebase.google.com" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-amber-400 hover:underline font-bold inline-flex items-center gap-0.5"
                  >
                    لوحة تحكم Firebase <ExternalLink className="w-2.5 h-2.5 inline" />
                  </a>
                </li>
                <li>
                  {lang === 'ar'
                    ? 'اختر مشروعك الحالي ثم توجه لقائمة Authentication ثم علامة التبويب Sign-In Method.'
                    : 'Select your app Firestore project -> click Authentication menu -> open Sign-in Method tab.'}
                </li>
                <li>
                  {lang === 'ar'
                    ? 'اضغط على Add New Provider ثم اختر Email/Password وقم بتفعيله والمسح على حفظ (Save).'
                    : 'Click Add New Provider -> select Email/Password -> switch Enable to Active -> click Save.'}
                </li>
                <li>
                  {lang === 'ar'
                    ? 'عد فوراً إلى نافذة تسجيل الدخول البريدي هنا، وقم بإنشاء حسابك برقم سري والتمتع بالتعديل فورياً!'
                    : 'Return here, register with your password to access complete map editing capacities offline and online.'}
                </li>
              </ol>

              <div className="flex items-center gap-2 text-slate-400 border-t border-slate-900 pt-2 text-[9px]">
                <Info className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  {lang === 'ar'
                    ? 'ملاحظة: لتتمكن من تعديل دبابيس الإدارة على الخريطة، يجب أن يتطابق بريدك تماماً مع البريد المصرح به فى القواعد: itegy73@gmail.com'
                    : 'Note: To write changes successfully, verify the email input strictly matches your admin email itegy73@gmail.com'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
