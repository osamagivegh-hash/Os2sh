const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// نماذج البيانات
const News = require('./models/News');
const User = require('./models/User');
const Comment = require('./models/Comment');

const app = express();

// 🔧 إعدادات مهمة لـ Render
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 8000;

// التحقق من وجود ملفات القوالب
const templatesDir = path.join(__dirname, 'views');
const requiredTemplates = ['admin.ejs', 'admin-edit.ejs', 'overview.ejs', 'news.ejs', 'admin-login.ejs', 'register.ejs', 'login.ejs', 'about.ejs', 'contact.ejs', 'error.ejs'];

console.log('📁 Checking template files...');
requiredTemplates.forEach(template => {
  const filePath = path.join(templatesDir, template);
  if (fs.existsSync(filePath)) console.log(`✅ ${template} - موجود`);
  else console.log(`❌ ${template} - غير موجود`);
});

// إعداد EJS
app.set('view engine', 'ejs');
app.set("views", path.join(__dirname, "views"));
app.set('views', templatesDir);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🔧 إعداد الجلسات (بدون connect-mongo)
app.use(session({
  secret: process.env.SESSION_SECRET || 'familysecret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 // 24 ساعة
  }
}));

// Multer لتخزين الصور
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يجب أن يكون الملف صورة!'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ----- MongoDB -----
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('❌ MONGO_URI غير مضبوط في البيئة');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB متصل بنجاح');
  } catch (err) {
    console.error('❌ خطأ في الاتصال بMongoDB:', err.message);
    process.exit(1);
  }
};

// ----- Admin Authentication -----
function isAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect('/admin/login');
}

// ----- Routes -----
// Admin login
app.get('/admin/login', (req, res) => res.render('admin-login'));

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if(username === 'admin' && password === 'admin123'){
      req.session.admin = true;
      return res.redirect('/admin');
    }
    res.render('admin-login', { error: 'بيانات دخول غير صحيحة' });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تسجيل الدخول' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Admin panel - عرض الأخبار
app.get('/admin', isAdmin, async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.render('admin', { news });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تحميل لوحة التحكم' });
  }
});

// Add news
app.post('/admin/add-news', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const newsData = { ...req.body, isPublished: req.body.isPublished === 'on' };
    if (req.file) newsData.imageUrl = '/uploads/' + req.file.filename;
    const newsItem = new News(newsData);
    await newsItem.save();
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في إضافة الخبر' });
  }
});

// Edit news form
app.get('/admin/edit-news/:id', isAdmin, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) return res.status(404).render('error', { message: 'الخبر غير موجود' });
    res.render('admin-edit', { newsItem });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تحميل صفحة التعديل' });
  }
});

// Update news
app.post('/admin/edit-news/:id', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body, isPublished: req.body.isPublished === 'on' };

    // حذف الصورة القديمة إذا تم رفع صورة جديدة
    if (req.file) {
      updateData.imageUrl = '/uploads/' + req.file.filename;
      const oldNews = await News.findById(req.params.id);
      if (oldNews.imageUrl && oldNews.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', oldNews.imageUrl);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
    }

    // حذف الصورة إذا طلب المستخدم
    if (req.body.removeImage === 'true') {
      const oldNews = await News.findById(req.params.id);
      if (oldNews.imageUrl && oldNews.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', oldNews.imageUrl);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
      updateData.imageUrl = '';
    }

    await News.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تحديث الخبر' });
  }
});

// Delete news
app.post('/admin/delete-news/:id', isAdmin, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (newsItem.imageUrl && newsItem.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, 'public', newsItem.imageUrl);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
    await News.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في حذف الخبر' });
  }
});

// ----- Customer routes -----
app.get('/register', (req, res) => {
  res.render('register', { user: req.session.user });
});

app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.render('register', { error: 'البريد الإلكتروني مسجل مسبقاً', user: null });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hash });
    await user.save();
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تسجيل المستخدم' });
  }
});

app.get('/login', (req, res) => {
  res.render('login', { user: req.session.user });
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.render('login', { error: 'المستخدم غير موجود', user: null });

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.user = user;
      return res.redirect('/');
    }
    res.render('login', { error: 'كلمة المرور خاطئة', user: null });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تسجيل الدخول' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

// Overview page
app.get('/', async (req, res) => {
  try {
    const news = await News.find({ isPublished: true }).sort({ createdAt: -1 });
    res.render('overview', { news, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تحميل الصفحة الرئيسية' });
  }
});

// News details
app.get('/news/:id', async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) return res.status(404).render('error', { message: 'الخبر غير موجود' });

    const comments = await Comment.find({ news: req.params.id }).populate('user');
    res.render('news', { news: newsItem, comments, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تحميل الخبر' });
  }
});

// Add comment
app.post('/news/:id/comment', async (req, res) => {
  try {
    if (!req.session.user) return res.render('news', { 
      news: await News.findById(req.params.id), 
      comments: await Comment.find({ news: req.params.id }).populate('user'),
      error: 'يجب تسجيل الدخول لإضافة تعليق',
      user: null
    });

    if (!req.body.text || !req.body.text.trim()) return res.render('news', {
      news: await News.findById(req.params.id),
      comments: await Comment.find({ news: req.params.id }).populate('user'),
      error: 'التعليق لا يمكن أن يكون فارغاً',
      user: req.session.user
    });

    const comment = new Comment({
      news: req.params.id,
      user: req.session.user._id,
      text: req.body.text,
      rating: Number(req.body.rating) || 0
    });
    await comment.save();
    res.redirect(`/news/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في إضافة التعليق' });
  }
});

// About page
app.get('/about', (req, res) => {
  res.render('about', { user: req.session.user });
});

// Contact page
app.get('/contact', (req, res) => {
  res.render('contact', { user: req.session.user });
});

app.post('/contact', (req, res) => {
  res.render('contact', { 
    user: req.session.user, 
    success: 'تم إرسال رسالتك بنجاح، سنتواصل معك قريباً' 
  });
});

// 404 - صفحة غير موجودة
app.use((req, res) => {
  res.status(404).render('error', { 
    message: 'الصفحة التي تبحث عنها غير موجودة',
    user: req.session.user 
  });
});

// معالج الأخطاء العام
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { 
    message: 'حدث خطأ غير متوقع في الخادم',
    user: req.session.user 
  });
});

// 🔧 تشغيل الخادم مع معالجة الأخطاء
const startServer = async () => {
  try {
    // الاتصال بقاعدة البيانات
    await connectDB();
    
    // استمع على المنفذ الصحيح
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🌐 Available: http://localhost:${port}`);
      if (isProduction) {
        console.log('✅ Running in production mode');
      } else {
        console.log('🔧 Running in development mode');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// 🔧 معالج الأخطاء غير المتوقعة
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

// ابدأ تشغيل الخادم
startServer();