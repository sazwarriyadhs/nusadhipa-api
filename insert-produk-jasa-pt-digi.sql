-- ============================================================
-- Insert Produk Jasa PT DIGI MEDIA KOMUNIKA
-- Berdasarkan portfolio: portofolio-pabey.vercel.app
-- business_id = 2
-- ============================================================

START TRANSACTION;

-- 1. AI Transformation Consulting
INSERT INTO products (public_id, business_id, category_id, name, slug, sku, short_description, description, product_type, condition_type, status, weight_grams, requires_shipping, published_at)
VALUES (UUID(), 2, 38, 'AI Transformation Consulting', 'ai-transformation-consulting', 'DIGI-AI-CONS-01',
'Konsultasi transformasi AI untuk bisnis — readiness assessment, roadmap, strategi implementasi.',
'Konsultasi transformasi AI untuk bisnis. Meliputi AI readiness assessment, roadmap AI, dan strategi implementasi. Dipandu oleh AI Transformation Leader dengan pengalaman membangun DigiAI, SerenityEWS, dan Serenitytrade.',
'service', 'new', 'active', 0, 0, NOW());
SET @pid1 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, variant_name, sku, price, is_active)
VALUES (@pid1, 'Per Jam', 'DIGI-AI-CONS-01-1H', 500000.00, 1);

-- 2. Custom Software Development
INSERT INTO products (public_id, business_id, category_id, name, slug, sku, short_description, description, product_type, condition_type, status, weight_grams, requires_shipping, published_at)
VALUES (UUID(), 2, 38, 'Custom Software Development', 'custom-software-development', 'DIGI-SW-DEV-01',
'Pengembangan software custom (web, backend, full-stack) dengan teknologi modern.',
'Pengembangan software custom (web, backend, full-stack) dengan teknologi modern. Spesialis di TypeScript, Go, Python. Portofolio: DigiAI, SerenityEWS, Serenitytrade, VisionAsk, DataNexus, AgroHub.',
'service', 'new', 'active', 0, 0, NOW());
SET @pid2 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, variant_name, sku, price, is_active)
VALUES (@pid2, 'Per Project', 'DIGI-SW-DEV-01-PRJ', 5000000.00, 1);

-- 3. Mobile App Development
INSERT INTO products (public_id, business_id, category_id, name, slug, sku, short_description, description, product_type, condition_type, status, weight_grams, requires_shipping, published_at)
VALUES (UUID(), 2, 38, 'Mobile App Development', 'mobile-app-development', 'DIGI-MOB-DEV-01',
'Pengembangan aplikasi mobile cross-platform (Flutter, React Native) untuk Android & iOS.',
'Pengembangan aplikasi mobile cross-platform (Flutter, React Native) untuk Android & iOS. Termasuk UI/UX design, integrasi API, testing, dan deployment ke store.',
'service', 'new', 'active', 0, 0, NOW());
SET @pid3 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, variant_name, sku, price, is_active)
VALUES (@pid3, 'Per Project', 'DIGI-MOB-DEV-01-PRJ', 15000000.00, 1);

-- 4. AI/ML Engineering
INSERT INTO products (public_id, business_id, category_id, name, slug, sku, short_description, description, product_type, condition_type, status, weight_grams, requires_shipping, published_at)
VALUES (UUID(), 2, 38, 'AI/ML Engineering', 'ai-ml-engineering', 'DIGI-AI-ML-01',
'Implementasi solusi AI/ML: Generative AI, RAG, AI Agents, Computer Vision, Prediction.',
'Implementasi solusi AI/ML: Generative AI, RAG & AI Agents, Computer Vision, Prediction & Recommendation, Intelligent Automation, Decision Support. Menggunakan OpenAI, LangChain, TensorFlow.',
'service', 'new', 'active', 0, 0, NOW());
SET @pid4 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, variant_name, sku, price, is_active)
VALUES (@pid4, 'Per Project', 'DIGI-AI-ML-01-PRJ', 10000000.00, 1);

-- 5. Digital Architecture & Strategy
INSERT INTO products (public_id, business_id, category_id, name, slug, sku, short_description, description, product_type, condition_type, status, weight_grams, requires_shipping, published_at)
VALUES (UUID(), 2, 39, 'Digital Architecture & Strategy', 'digital-architecture-strategy', 'DIGI-ARCH-01',
'Perancangan arsitektur digital modern: Strategy → Architecture → Engineering → Product.',
'Perancangan arsitektur digital modern (Strategy → Architecture → Engineering → Product). Meliputi Web/Mobile, API Gateway, Domain Services, AI Services, Data Layer.',
'service', 'new', 'active', 0, 0, NOW());
SET @pid5 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, variant_name, sku, price, is_active)
VALUES (@pid5, 'Per Session', 'DIGI-ARCH-01-SES', 3000000.00, 1);

-- 6. AI/Data Platform Integration
INSERT INTO products (public_id, business_id, category_id, name, slug, sku, short_description, description, product_type, condition_type, status, weight_grams, requires_shipping, published_at)
VALUES (UUID(), 2, 39, 'AI/Data Platform Integration', 'ai-data-platform-integration', 'DIGI-PLATFORM-01',
'Integrasi AI & data platform: API, data pipeline, RAG system, AI agents.',
'Integrasi AI & data platform untuk bisnis. Meliputi API integration, data pipeline, RAG system, AI agents, dan decision support systems.',
'service', 'new', 'active', 0, 0, NOW());
SET @pid6 = LAST_INSERT_ID();
INSERT INTO product_variants (product_id, variant_name, sku, price, is_active)
VALUES (@pid6, 'Per Project', 'DIGI-PLATFORM-01-PRJ', 8000000.00, 1);

COMMIT;

-- Verifikasi
SELECT p.id, p.name, p.product_type, p.status, pv.price
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
WHERE p.business_id = 2;
