-- Members choose skills and interests in the Turkish member area, so the lists read in Turkish. Codes stay the same;
-- a name is only replaced while it is still the original English seed name, so names edited by staff are kept.

update skills s set skill_name = v.tr, updated_at = now()
from (values
  ('SOFTWARE_DEVELOPMENT', 'Software Development', 'Yazılım geliştirme'),
  ('PYTHON', 'Python', 'Python'),
  ('JAVASCRIPT', 'JavaScript', 'JavaScript'),
  ('DATA_ANALYSIS', 'Data Analysis', 'Veri analizi'),
  ('MACHINE_LEARNING', 'Machine Learning', 'Makine öğrenmesi'),
  ('PROMPT_ENGINEERING', 'Prompt Engineering', 'Prompt mühendisliği'),
  ('EXCEL', 'Excel', 'Excel'),
  ('PROJECT_MANAGEMENT', 'Project Management', 'Proje yönetimi'),
  ('PRODUCT_MANAGEMENT', 'Product Management', 'Ürün yönetimi'),
  ('SALES', 'Sales', 'Satış'),
  ('NEGOTIATION', 'Negotiation', 'Müzakere'),
  ('DIGITAL_MARKETING', 'Digital Marketing', 'Dijital pazarlama'),
  ('CONTENT_CREATION', 'Content Creation', 'İçerik üretimi'),
  ('FINANCIAL_MODELING', 'Financial Modeling', 'Finansal modelleme'),
  ('ACCOUNTING', 'Accounting', 'Muhasebe'),
  ('INVESTING', 'Investing', 'Yatırım'),
  ('REAL_ESTATE_ANALYSIS', 'Real Estate Analysis', 'Gayrimenkul analizi'),
  ('SKETCHUP', 'SketchUp', 'SketchUp'),
  ('AUTOCAD', 'AutoCAD', 'AutoCAD'),
  ('GRAPHIC_DESIGN', 'Graphic Design', 'Grafik tasarım'),
  ('PHOTOGRAPHY', 'Photography', 'Fotoğrafçılık'),
  ('CREATIVE_WRITING', 'Creative Writing', 'Yaratıcı yazarlık'),
  ('ENGLISH', 'English', 'İngilizce'),
  ('SPANISH', 'Spanish', 'İspanyolca'),
  ('RUSSIAN', 'Russian', 'Rusça'),
  ('PUBLIC_SPEAKING', 'Public Speaking', 'Topluluk önünde konuşma'),
  ('FACILITATION', 'Facilitation', 'Kolaylaştırıcılık'),
  ('TEACHING', 'Teaching', 'Eğitmenlik')
) as v(code, en, tr)
where s.skill_code = v.code and s.skill_name = v.en and v.en <> v.tr;

update interests i set interest_name = v.tr, updated_at = now()
from (values
  ('ARTIFICIAL_INTELLIGENCE', 'Artificial Intelligence', 'Yapay zekâ'),
  ('ENTREPRENEURSHIP', 'Entrepreneurship', 'Girişimcilik'),
  ('STARTUPS', 'Startups', 'Startup''lar'),
  ('MARKETING', 'Marketing', 'Pazarlama'),
  ('SOFTWARE_DEVELOPMENT', 'Software Development', 'Yazılım geliştirme'),
  ('DATA_SCIENCE', 'Data Science', 'Veri bilimi'),
  ('CYBERSECURITY', 'Cybersecurity', 'Siber güvenlik'),
  ('E_COMMERCE', 'E-commerce', 'E-ticaret'),
  ('DIGITAL_MARKETING', 'Digital Marketing', 'Dijital pazarlama'),
  ('FINANCE', 'Finance', 'Finans'),
  ('INVESTING', 'Investing', 'Yatırım'),
  ('REAL_ESTATE', 'Real Estate', 'Gayrimenkul'),
  ('ARCHITECTURE', 'Architecture', 'Mimarlık'),
  ('INTERIOR_DESIGN', 'Interior Design', 'İç mimarlık'),
  ('DESIGN', 'Design', 'Tasarım'),
  ('WRITING', 'Writing', 'Yazmak'),
  ('LANGUAGES', 'Languages', 'Diller'),
  ('TRAVEL', 'Travel', 'Seyahat'),
  ('SUSTAINABILITY', 'Sustainability', 'Sürdürülebilirlik')
) as v(code, en, tr)
where i.interest_code = v.code and i.interest_name = v.en;
