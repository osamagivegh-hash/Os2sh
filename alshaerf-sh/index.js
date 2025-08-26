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

// إنشاء مجلد views إذا لم يكن موجوداً
const viewsDir = path.join(__dirname, 'views');
if (!fs.existsSync(viewsDir)) {
  console.log('📁 Creating views directory...');
  fs.mkdirSync(viewsDir, { recursive: true });
}

// إنشاء الملفات الأساسية إذا لم تكن موجودة
const createBasicTemplates = () => {
  const templates = {
    'error.ejs': `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>خطأ</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .error-container { background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 15px; text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); max-width: 500px; }
        h1 { color: #e53e3e; margin-bottom: 20px; font-size: 2rem; }
        p { color: #4a5568; margin-bottom: 30px; font-size: 1.1rem; line-height: 1.6; }
        .home-link { display: inline-block; background: #4a5568; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; transition: background 0.3s ease; }
        .home-link:hover { background: #2d3748; }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>⚠️ خطأ</h1>
        <p><%= message %></p>
        <a href="/" class="home-link">العودة إلى الصفحة الرئيسية</a>
    </div>
</body>
</html>
    `,
    'overview.ejs': `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>أخبار العائلة - الصفحة الرئيسية</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #333; line-height: 1.6; min-height: 100vh; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        header { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; margin-bottom: 30px; text-align: center; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); }
        h1 { color: #4a5568; margin-bottom: 20px; font-size: 2.5rem; }
        .auth-links { margin: 15px 0; }
        .auth-links a { color: #4a5568; text-decoration: none; margin: 0 10px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
        .auth-links a:hover { background: #4a5568; color: white; }
        .welcome-message { background: #48bb78; color: white; padding: 10px 20px; border-radius: 20px; margin: 10px 0; }
        .news-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; margin-bottom: 40px; }
        .news-card { background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 25px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease; }
        .news-card:hover { transform: translateY(-5px); }
        .news-card h2 { color: #2d3748; margin-bottom: 15px; font-size: 1.5rem; }
        .news-card p { color: #4a5568; margin-bottom: 20px; line-height: 1.8; }
        .read-more { display: inline-block; background: #4a5568; color: white; padding: 10px 20px; text-decoration: none; border-radius: 25px; transition: background 0.3s ease; }
        .read-more:hover { background: #2d3748; }
        .no-news { text-align: center; background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 15px; color: #4a5568; }
        footer { background: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 15px; text-align: center; margin-top: 40px; }
        .footer-links { margin: 15px 0; }
        .footer-links a { color: #4a5568; text-decoration: none; margin: 0 15px; transition: color 0.3s ease; }
        .footer-links a:hover { color: #2d3748; text-decoration: underline; }
        @media (max-width: 768px) { .news-grid { grid-template-columns: 1fr; } h1 { font-size: 2rem; } }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>أخبار العائلة</h1>
            <% if (user) { %>
                <div class="welcome-message">مرحباً، <strong><%= user.name %></strong> | <a href="/logout" style="color: white; text-decoration: underline;">تسجيل الخروج</a></div>
            <% } else { %>
                <div class="auth-links">
                    <a href="/login">تسجيل الدخول</a>
                    <a href="/register">إنشاء حساب</a>
                </div>
            <% } %>
        </header>

        <main>
            <% if (news && news.length > 0) { %>
                <div class="news-grid">
                    <% news.forEach(item => { %>
                        <div class="news-card">
                            <h2><%= item.title %></h2>
                            <p><%= item.content.substring(0, 150) %>...</p>
                            <a href="/news/<%= item._id %>" class="read-more">قراءة المزيد</a>
                        </div>
                    <% }); %>
                </div>
            <% } else { %>
                <div class="no-news">
                    <h2>لا توجد أخبار متاحة حالياً</h2>
                    <p>يرجى العودة لاحقاً لمشاهدة آخر أخبار العائلة</p>
                </div>
            <% } %>
        </main>

        <footer>
            <div class="footer-links">
                <a href="/about">عن الموقع</a>
                <a href="/contact">اتصل بنا</a>
                <a href="/admin/login">لوحة التحكم</a>
            </div>
            <p>© 2023 موقع أخبار العائلة. جميع الحقوق محفوظة.</p>
        </footer>
    </div>
</body>
</html>
    `,
    'admin-login.ejs': `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة التحكم - تسجيل الدخول</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .login-container { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); width: 100%; max-width: 400px; }
        .header { text-align: center; margin-bottom: 30px; }
        h1 { color: #fff; margin-bottom: 10px; font-size: 2rem; }
        .subtitle { color: #a0aec0; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 600; }
        input { width: 100%; padding: 15px; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 10px; font-size: 1rem; color: #fff; transition: border-color 0.3s ease; }
        input:focus { outline: none; border-color: #63b3ed; }
        input::placeholder { color: #a0aec0; }
        button { width: 100%; background: #63b3ed; color: #1a202c; padding: 15px; border: none; border-radius: 10px; font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: background 0.3s ease; }
        button:hover { background: #4299e1; }
        .back-link { display: block; text-align: center; margin-top: 25px; color: #a0aec0; }
        .back-link a { color: #63b3ed; text-decoration: none; }
        .back-link a:hover { text-decoration: underline; }
        .error { color: #fc8181; text-align: center; margin-bottom: 15px; }
        @media (max-width: 480px) { .login-container { padding: 30px 20px; } h1 { font-size: 1.7rem; } }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="header">
            <h1>لوحة التحكم</h1>
            <p class="subtitle">تسجيل الدخول للإدارة</p>
        </div>
        
        <% if (error) { %>
            <div class="error"><%= error %></div>
        <% } %>
        
        <form action="/admin/login" method="POST">
            <div class="form-group">
                <label for="username">اسم المستخدم</label>
                <input type="text" id="username" name="username" placeholder="أدخل اسم المستخدم" required>
            </div>
            
            <div class="form-group">
                <label for="password">كلمة المرور</label>
                <input type="password" id="password" name="password" placeholder="أدخل كلمة المرور" required>
            </div>
            
            <button type="submit">تسجيل الدخول</button>
        </form>
        
        <div class="back-link">
            <a href="/">← العودة إلى الموقع الرئيسي</a>
        </div>
    </div>
</body>
</html>
    `,
    'register.ejs': `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>إنشاء حساب - أخبار العائلة</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); width: 100%; max-width: 450px; }
        .header { text-align: center; margin-bottom: 30px; }
        h1 { color: #4a5568; margin-bottom: 10px; font-size: 2rem; }
        .subtitle { color: #718096; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #4a5568; font-weight: 600; }
        input { width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 1rem; transition: border-color 0.3s ease; }
        input:focus { outline: none; border-color: #4a5568; }
        button { width: 100%; background: #4a5568; color: white; padding: 15px; border: none; border-radius: 10px; font-size: 1.1rem; cursor: pointer; transition: background 0.3s ease; }
        button:hover { background: #2d3748; }
        .login-link { text-align: center; margin-top: 25px; color: #718096; }
        .login-link a { color: #4a5568; text-decoration: none; font-weight: 600; }
        .login-link a:hover { text-decoration: underline; }
        .back-link { display: inline-block; color: #4a5568; text-decoration: none; margin-bottom: 20px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
        .back-link:hover { background: #4a5568; color: white; }
        .error { color: #e53e3e; text-align: center; margin-bottom: 15px; }
        @media (max-width: 480px) { .container { padding: 30px 20px; } h1 { font-size: 1.7rem; } }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← العودة إلى الرئيسية</a>
        
        <div class="header">
            <h1>إنشاء حساب جديد</h1>
            <p class="subtitle">انضم إلى عائلتنا وكن جزءاً من مجتمعنا</p>
        </div>
        
        <% if (error) { %>
            <div class="error"><%= error %></div>
        <% } %>
        
        <form action="/register" method="POST">
            <div class="form-group">
                <label for="name">الاسم الكامل</label>
                <input type="text" id="name" name="name" required>
            </div>
            
            <div class="form-group">
                <label for="email">البريد الإلكتروني</label>
                <input type="email" id="email" name="email" required>
            </div>
            
            <div class="form-group">
                <label for="password">كلمة المرور</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <button type="submit">إنشاء الحساب</button>
        </form>
        
        <div class="login-link">
            <p>هل لديك حساب بالفعل؟ <a href="/login">تسجيل الدخول</a></p>
        </div>
    </div>
</body>
</html>
    `,
    'login.ejs': `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تسجيل الدخول - أخبار العائلة</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); width: 100%; max-width: 450px; }
        .header { text-align: center; margin-bottom: 30px; }
        h1 { color: #4a5568; margin-bottom: 10px; font-size: 2rem; }
        .subtitle { color: #718096; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #4a5568; font-weight: 600; }
        input { width: 100%; padding: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 1rem; transition: border-color 0.3s ease; }
        input:focus { outline: none; border-color: #4a5568; }
        button { width: 100%; background: #4a5568; color: white; padding: 15px; border: none; border-radius: 10px; font-size: 1.1rem; cursor: pointer; transition: background 0.3s ease; }
        button:hover { background: #2d3748; }
        .register-link { text-align: center; margin-top: 25px; color: #718096; }
        .register-link a { color: #4a5568; text-decoration: none; font-weight: 600; }
        .register-link a:hover { text-decoration: underline; }
        .back-link { display: inline-block; color: #4a5568; text-decoration: none; margin-bottom: 20px; padding: 8px 16px; border: 2px solid #4a5568; border-radius: 25px; transition: all 0.3s ease; }
        .back-link:hover { background: #4a5568; color: white; }
        .error { color: #e53e3e; text-align: center; margin-bottom: 15px; }
        @media (max-width: 480px) { .container { padding: 30px 20px; } h1 { font-size: 1.7rem; } }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← العودة إلى الرئيسية</a>
        
        <div class="header">
            <h1>تسجيل الدخول</h1>
            <p class="subtitle">أهلاً بعودتك إلى عائلتنا</p>
        </div>
        
        <% if (error) { %>
            <div class="error"><%= error %></div>
        <% } %>
        
        <form action="/login" method="POST">
            <div class="form-group">
                <label for="email">البريد الإلكتروني</label>
                <input type="email" id="email" name="email" required>
            </div>
            
            <div class="form-group">
                <label for="password">كلمة المرور</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <button type="submit">تسجيل الدخول</button>
        </form>
        
        <div class="register-link">
            <p>ليس لديك حساب؟ <a href="/register">إنشاء حساب جديد</a></p>
        </div>
    </div>
</body>
</html>
    `
  };

  Object.entries(templates).forEach(([filename, content]) => {
    const filePath = path.join(viewsDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content.trim());
      console.log(`✅ Created ${filename}`);
    }
  });
};

// استدعاء الدالة لإنشاء القوالب الأساسية
createBasicTemplates();

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
app.get('/admin/login', (req, res) => res.render('admin-login', { error: null }));

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

    if (req.file) {
      updateData.imageUrl = '/uploads/' + req.file.filename;
      const oldNews = await News.findById(req.params.id);
      if (oldNews.imageUrl && oldNews.imageUrl.startsWith('/uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', oldNews.imageUrl);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
    }

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
  res.render('register', { user: req.session.user, error: null });
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
  res.render('login', { user: req.session.user, error: null });
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

// News details - صفحة بسيطة للبدء
app.get('/news/:id', async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) return res.status(404).render('error', { message: 'الخبر غير موجود' });

    const comments = await Comment.find({ news: req.params.id }).populate('user');
    res.send(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>${newsItem.title}</title>
        <style>
          body { font-family: Arial; padding: 20px; background: #f8f9fa; }
          .news-container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #2d3748; margin-bottom: 20px; }
          .news-content { line-height: 1.8; color: #4a5568; margin-bottom: 30px; }
          .back-link { color: #007bff; text-decoration: none; }
          .back-link:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="news-container">
          <a href="/" class="back-link">← العودة إلى الرئيسية</a>
          <h1>${newsItem.title}</h1>
          <div class="news-content">${newsItem.content}</div>
          <p><small>نشر في: ${newsItem.createdAt.toLocaleDateString('ar-EG')}</small></p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { message: 'خطأ في تحميل الخبر' });
  }
});

// About page
app.get('/about', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <title>عن الموقع</title>
      <style>
        body { font-family: Arial; padding: 20px; background: #f8f9fa; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2d3748; margin-bottom: 20px; }
        .back-link { color: #007bff; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <a href="/" class="back-link">← العودة إلى الرئيسية</a>
        <h1>عن موقع أخبار العائلة</h1>
        <p>مرحباً بكم في منصة أخبار العائلة، حيث نشارك آخر الأخبار والأحداث الخاصة بعائلتنا الكريمة.</p>
      </div>
    </body>
    </html>
  `);
});

// Contact page
app.get('/contact', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <title>اتصل بنا</title>
      <style>
        body { font-family: Arial; padding: 20px; background: #f8f9fa; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2d3748; margin-bottom: 20px; }
        .back-link { color: #007bff; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <a href="/" class="back-link">← العودة إلى الرئيسية</a>
        <h1>اتصل بنا</h1>
        <p>للتواصل معنا، يرجى إرسال بريد إلكتروني إلى: info@family-news.com</p>
      </div>
    </body>
    </html>
  `);
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