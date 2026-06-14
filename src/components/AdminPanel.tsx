import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  Eye, 
  EyeOff, 
  X, 
  Compass, 
  CheckCircle, 
  Info, 
  AlertCircle,
  Minimize2,
  ListFilter,
  ArrowRight,
  Sparkles,
  Search
} from 'lucide-react';
import { Building } from '../data/buildings';

interface AdminPanelProps {
  buildings: Building[];
  onPreview: (draftList: Building[]) => void;
  onPublish: (updatedPlace: Building) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  lang: 'ar' | 'en';
  draftPlaces: Building[] | null;
  onClearDrafts: () => void;
  onPublishAllDrafts: (drafts: Building[]) => Promise<void>;
  setSelectedBuilding: (b: Building | null) => void;
  selectedBuilding: Building | null;
}

export default function AdminPanel({
  buildings,
  onPreview,
  onPublish,
  onDelete,
  lang,
  draftPlaces,
  onClearDrafts,
  onPublishAllDrafts,
  setSelectedBuilding,
  selectedBuilding
}: AdminPanelProps) {
  // Local state for building edit form
  const [formId, setFormId] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [type, setType] = useState<Building['type']>('rooms');
  const [resort, setResort] = useState<Building['resort']>('club');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [hoursAr, setHoursAr] = useState('');
  const [hoursEn, setHoursEn] = useState('');

  // Synchronize dynamic coordinates from parent if currently editing this specific building
  useEffect(() => {
    if (isEditing && formId && parseInt(formId) === selectedBuilding?.id) {
      setOffsetX(selectedBuilding.offsetX);
      setOffsetY(selectedBuilding.offsetY);
    }
  }, [selectedBuilding?.offsetX, selectedBuilding?.offsetY, isEditing, formId]);

  // Search places specifically inside the directory
  const [searchQuery, setSearchQuery] = useState('');
  const [alertMessage, setAlertMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Filter building directory
  const filteredDirectory = useMemo(() => {
    return buildings.filter(b => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return b.id.toString().includes(q) || 
             b.nameAr.toLowerCase().includes(q) || 
             b.nameEn.toLowerCase().includes(q);
    });
  }, [buildings, searchQuery]);

  // Set alert with auto dismissal
  const triggerAlert = (text: string, type: 'success' | 'error' = 'success') => {
    setAlertMessage({ text, type });
    setTimeout(() => {
      setAlertMessage(null);
    }, 4000);
  };

  // Convert current form values to a Building object
  const getFormBuildingObject = (): Building => {
    return {
      id: parseInt(formId),
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      type,
      resort,
      descriptionAr: descriptionAr.trim(),
      descriptionEn: descriptionEn.trim(),
      offsetX: Number(offsetX),
      offsetY: Number(offsetY),
      hoursAr: hoursAr.trim() || undefined,
      hoursEn: hoursEn.trim() || undefined,
    };
  };

  // Pre-populate form when selecting to edit a place
  const handleEditClick = (b: Building) => {
    setIsEditing(true);
    setFormId(b.id.toString());
    setNameAr(b.nameAr);
    setNameEn(b.nameEn);
    setType(b.type);
    setResort(b.resort);
    setDescriptionAr(b.descriptionAr);
    setDescriptionEn(b.descriptionEn);
    setOffsetX(b.offsetX);
    setOffsetY(b.offsetY);
    setHoursAr(b.hoursAr || '');
    setHoursEn(b.hoursEn || '');
    
    // Smooth scroll to form element
    const element = document.getElementById('admin-form-anchor');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Create preview of current form input locally
  const handlePreviewLocal = () => {
    const idNum = parseInt(formId);
    if (isNaN(idNum) || idNum <= 0) {
      triggerAlert(lang === 'ar' ? 'رقم المبنى مطلوب وصالح' : 'Valid building ID is required', 'error');
      return;
    }
    if (!nameAr.trim() || !nameEn.trim()) {
      triggerAlert(lang === 'ar' ? 'الاسم باللغة العربية والإنجليزية مطلوب' : 'Arabic and English names are required', 'error');
      return;
    }

    const draftObj = getFormBuildingObject();
    
    // Create new list of buildings incorporating the draft object
    const updatedList = buildings.map(b => b.id === draftObj.id ? draftObj : b);
    if (!buildings.some(b => b.id === draftObj.id)) {
      updatedList.push(draftObj);
    }

    onPreview(updatedList);
    setSelectedBuilding(draftObj);
    triggerAlert(
      lang === 'ar' 
        ? 'تم تطبيق المعاينة المحلية بنجاح! شاهد موقع المبنى على الخريطة بالأعلى.' 
        : 'Local map preview applied successfully! Check the map above.'
    );

    // Zoom or scroll them to the map
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  // Publish form input to Firebase directly
  const handlePublishDirect = async () => {
    const idNum = parseInt(formId);
    if (isNaN(idNum) || idNum <= 0) {
      triggerAlert(lang === 'ar' ? 'رقم المبنى مطلوب وصالح' : 'Valid building ID is required', 'error');
      return;
    }
    if (!nameAr.trim() || !nameEn.trim()) {
      triggerAlert(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required', 'error');
      return;
    }

    try {
      const placeObj = getFormBuildingObject();
      await onPublish(placeObj);
      onClearDrafts(); // Wipe out draft overrides to load from Firestore
      resetForm();
      triggerAlert(
        lang === 'ar'
          ? 'تم حفظ ونشر التغييرات رسمياً إلى الخرائط وسوف يراها كافة المستخدمين الآن!'
          : 'Changes successfully published to production database!'
      );
    } catch (e) {
      triggerAlert(lang === 'ar' ? 'فشل الحفظ في قاعدة البيانات بقواعد حماية Firestore' : 'Failed to publish via Firestore security', 'error');
    }
  };

  // Publish all active drafts that admin has currently generated as preview
  const handlePublishAllDraftsActive = async () => {
    if (!draftPlaces) return;
    try {
      // Find what modified buildings exist in draft
      const activeDraft = draftPlaces.find(b => b.id === parseInt(formId)) || getFormBuildingObject();
      await onPublish(activeDraft);
      onClearDrafts();
      resetForm();
      triggerAlert(
        lang === 'ar'
          ? 'تم اعتماد ونشر جميع التعديلات المحفوظة بنجاح!'
          : 'All draft placements successfully synced and published!'
      );
    } catch (e) {
      triggerAlert(lang === 'ar' ? 'فشل النشر' : 'Publish failed', 'error');
    }
  };

  const handleDeleteClick = async (id: number) => {
    const confirmDelete = window.confirm(
      lang === 'ar' 
        ? `هل أنت متأكد من رغبتك في حذف/إخفاء مبنى رقم #${id}؟` 
        : `Are you sure you want to remove building #${id}?`
    );
    if (!confirmDelete) return;

    try {
      await onDelete(id);
      if (parseInt(formId) === id) {
        resetForm();
      }
      triggerAlert(
        lang === 'ar'
          ? 'تم حذف وإخفاء المكان بنجاح من المخططات.'
          : 'Building deleted from active maps.'
      );
    } catch (e) {
      triggerAlert(lang === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Deletion error occurred', 'error');
    }
  };

  const resetForm = () => {
    setFormId('');
    setNameAr('');
    setNameEn('');
    setType('rooms');
    setResort('club');
    setDescriptionAr('');
    setDescriptionEn('');
    setOffsetX(0);
    setOffsetY(0);
    setHoursAr('');
    setHoursEn('');
    setIsEditing(false);
  };

  return (
    <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 md:p-6 space-y-6 shadow-2xl relative animate-fade-in" style={{ direction: 'rtl' }}>
      <div className="absolute top-0 left-0 -ml-16 -mt-16 w-36 h-36 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 text-right">
        <div>
          <h2 className="text-base md:text-lg font-black text-white flex items-center gap-2 justify-end">
            <span className="bg-amber-500/10 text-amber-400 px-2.5 py-1 text-xs rounded-full border border-amber-500/30">لوحة الإشراف والتطوير 🛠️</span>
            <span>بوابة صيانة معالم الخرائط</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl leading-normal">
            {lang === 'ar' 
              ? 'مرحبًا بك في واجهة المدير. تتيح لك هذه اللوحة تحرير معالم المنتجع أو الكافيهات، تعديل إحداثياتها الفيزيائية متراً بمتراً، إضافتها وتجريب موقعها محلياً دون التأثير على نزلاء الفندق حتى تختار النشر.' 
              : 'Manager console allows adjusting coordinates in actual meters, previewing draft pins visually prior to master saving.'}
          </p>
        </div>
      </div>

      {/* DRAFT FLOATING ALUMNI BANNER */}
      {draftPlaces && (
        <div className="bg-amber-500/15 border border-amber-500/30 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-scale-up">
          <div className="flex items-center gap-3 text-right">
            <div className="p-2 bg-amber-500 text-slate-950 rounded-xl">
              <Eye className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <strong className="text-xs text-amber-400 block font-black">وضع المعاينة المحلي نشط حالياً 👁️</strong>
              <p className="text-[10px] text-slate-300 leading-normal">
                {lang === 'ar'
                  ? 'الخريطة التفاعلية والبوصلة بالأعلى تقرأ مخططك المحلي المؤقت الآن. لن يرى ضيوف الفندق هذه التعديلات المحدثة إلا عند الضغط على نشر.'
                  : 'Map & indicators displaying your unsaved adjustments. Real guests see no updates yet.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={onClearDrafts}
              className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700/60 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إلغاء وتراجع ❌' : 'Cancel Draft'}</span>
            </button>
            <button
              onClick={handlePublishAllDraftsActive}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/10 transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{lang === 'ar' ? 'حفظ ونشر المعاينة للضيوف 🚀' : 'Save & Publish Live'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ALERT FEEDBACKS */}
      {alertMessage && (
        <div className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs text-right animate-scale-up ${
          alertMessage.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' 
            : 'bg-red-950/40 border-red-500/30 text-red-400'
        }`}>
          {alertMessage.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{alertMessage.text}</span>
        </div>
      )}

      {/* FORM ANCHOR */}
      <div id="admin-form-anchor" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ADD / EDIT PLACE FORM CARD */}
        <div className="lg:col-span-6 bg-slate-950 rounded-2xl p-4 sm:p-5 border border-slate-850 space-y-4">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-widest flex items-center gap-2 justify-end border-b border-slate-850 pb-2">
            <span>{isEditing ? (lang === 'ar' ? 'تعديل المعلم الحالي 📝' : 'Edit Place Info') : (lang === 'ar' ? 'إضافة وجهة جديدة 🆕' : 'Add New Spot')}</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </h3>

          <div className="grid grid-cols-2 gap-3 text-right">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">رمز المبنى الفريد (رقم ID):</label>
              <input
                type="number"
                disabled={isEditing}
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="مثال: 501"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none disabled:opacity-50 font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">المنطقة والتابعية الفندقية:</label>
              <select
                value={resort}
                onChange={(e) => setResort(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none focus:bg-slate-950"
              >
                <option value="club">{lang === 'ar' ? 'فندق كلوب 🏨' : 'Club Resort'}</option>
                <option value="life">{lang === 'ar' ? 'سي لايف 🌊' : 'Sea Life'}</option>
                <option value="gardens">{lang === 'ar' ? 'جاردنز 🍃' : 'Gardens'}</option>
                <option value="general">{lang === 'ar' ? 'خدمات عامة 🍽️' : 'General/Shared'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-right">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">الاسم بالكامل (العربية):</label>
              <input
                type="text"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="أدخل الاسم بالعربي..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Full Name (English):</label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="English designation..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none text-left"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-right">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">نوع التصنيف:</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="rooms">{lang === 'ar' ? 'غرف ونزلاء 🛏️' : 'Rooms'}</option>
                <option value="dining">{lang === 'ar' ? 'مطاعم وأغذية 🍽️' : 'Dining'}</option>
                <option value="facilities">{lang === 'ar' ? 'مرافق وسبا 🧖' : 'Facilities'}</option>
                <option value="sports">{lang === 'ar' ? 'ملاعب ورياضة 🎾' : 'Sports'}</option>
                <option value="recreation">{lang === 'ar' ? 'ترفيه وشاطئ 🌊' : 'Recreation'}</option>
                <option value="services">{lang === 'ar' ? 'خدمات واستقبال 🛎️' : 'Services'}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[9px] font-bold text-slate-450 block mb-1">أفقي X (شرق/غرب):</label>
                <input
                  type="number"
                  value={offsetX}
                  onChange={(e) => setOffsetX(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-2 text-xs text-center text-white focus:border-amber-500 focus:outline-none font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-450 block mb-1">رأسي Y (شمال/جنوب):</label>
                <input
                  type="number"
                  value={offsetY}
                  onChange={(e) => setOffsetY(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-2 text-xs text-center text-white focus:border-amber-500 focus:outline-none font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-850 text-[10px] text-slate-400 leading-relaxed font-mono">
            <Info className="w-3.5 h-3.5 text-amber-500 inline-block ml-1" />
            <span>نطاق إحداثيات المنتجع: X الأفقي من -210 إلى 240 متر. Y الرأسي من -190 إلى 175 متر. المبنى 0 هو نقطة الأصل.</span>
          </div>

          <div className="space-y-3 text-right">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">الوصف والمزايا (العربية):</label>
              <textarea
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                placeholder="أدخل شرح تفصيلي متميز ومزايا للضيف بحدود 150 حرف..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Description & Services (English):</label>
              <textarea
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                placeholder="Type descriptive features for guests..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none resize-none text-left"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-right">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">مواعيد العمل (العربية):</label>
              <input
                type="text"
                value={hoursAr}
                onChange={(e) => setHoursAr(e.target.value)}
                placeholder="مثال: مفتوح 24 ساعة"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Working Hours (English):</label>
              <input
                type="text"
                value={hoursEn}
                onChange={(e) => setHoursEn(e.target.value)}
                placeholder="E.g. Open 24/7"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-none text-left"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handlePreviewLocal}
              className="flex-1 py-2.5 px-3 bg-indigo-600/95 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span>{lang === 'ar' ? 'عرض ومعاينة على الخريطة 👁️' : 'Preview on Map'}</span>
            </button>
            
            <button
              type="button"
              onClick={handlePublishDirect}
              className="flex-1 py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isEditing ? (lang === 'ar' ? 'حفظ ونشر التعديل 🚀' : 'Save Update') : (lang === 'ar' ? 'حفظ ونشر مباشر للضيوف 🚀' : 'Publish to Production')}</span>
            </button>
          </div>

          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="w-full py-2 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-800"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إلغاء التعديل والعودة للإضافة' : 'Cancel Edit/Reset'}</span>
            </button>
          )}
        </div>

        {/* BUILDINGS DIRECTORY MODULE */}
        <div className="lg:col-span-6 bg-slate-950 rounded-2xl p-4 sm:p-5 border border-slate-850 flex flex-col h-[520px] overflow-hidden">
          <div className="space-y-3 pb-3 border-b border-slate-850">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-widest flex items-center gap-2 justify-end">
              <span>{lang === 'ar' ? 'دليل وجدول الأماكن المسجلة 📂' : 'Resort Registered Places'}</span>
              <ListFilter className="w-3.5 h-3.5 text-amber-500" />
            </h3>

            {/* Quick Filter Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'ar' ? 'تصفية سريعة بالرقم أو الإسم...' : 'Search directory...'}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pr-9 pl-3 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
              <Search className="w-4 h-4 text-slate-500 absolute top-2.5 right-3" />
            </div>
          </div>

          {/* Directory listings body */}
          <div className="flex-1 overflow-y-auto py-3 space-y-2 mt-2" style={{ scrollbarWidth: 'thin' }}>
            {filteredDirectory.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                {lang === 'ar' ? 'لا توجد مبانٍ مطابقة لتصفيات البحث.' : 'No buildings matched.'}
              </div>
            ) : (
              filteredDirectory.map((b) => {
                const isItemStatic = b.id <= 410; // Simple check for built-in vs added
                return (
                  <div 
                    key={b.id}
                    className="p-3 bg-slate-900 hover:bg-slate-850/80 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditClick(b)}
                        title={lang === 'ar' ? 'تحرير البيانات' : 'Edit place'}
                        className="p-1 px-2 bg-indigo-950 text-indigo-400 hover:bg-indigo-900 transition border border-indigo-900 rounded-lg text-[10px] font-black flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" />
                        <span>{lang === 'ar' ? 'تعديل' : 'Edit'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteClick(b.id)}
                        title={lang === 'ar' ? 'حذف هذا المكان' : 'Delete place'}
                        className="p-1 px-2 bg-red-950 text-red-400 hover:bg-red-900 transition border border-red-900/50 rounded-lg text-[10px] font-black flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{lang === 'ar' ? 'حذف' : 'Del'}</span>
                      </button>
                    </div>

                    <div className="text-right flex-1 min-w-0 pr-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`text-[8px] font-black px-1 rounded uppercase font-mono ${
                          b.resort === 'club' ? 'bg-emerald-950 text-emerald-400' :
                          b.resort === 'life' ? 'bg-cyan-950 text-cyan-400' :
                          b.resort === 'gardens' ? 'bg-violet-950 text-violet-400' :
                          'bg-amber-950 text-amber-400'
                        }`}>
                          {b.resort}
                        </span>
                        <span className="text-[9px] font-mono font-black text-slate-400">#{b.id}</span>
                        <strong className="text-xs text-white truncate font-bold">
                          {lang === 'ar' ? b.nameAr : b.nameEn}
                        </strong>
                      </div>
                      <div className="flex items-center justify-end gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                        <span>X: {b.offsetX}م</span>
                        <span>Y: {b.offsetY}م</span>
                        <span className="bg-slate-950/70 border border-slate-900 text-slate-500 rounded px-1 text-[9px]">
                          {b.type}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
