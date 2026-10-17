-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: nusadhipa_marketplace
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping data for table `products`
--
-- WHERE:  business_id=2

/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` (`id`, `public_id`, `business_id`, `category_id`, `name`, `slug`, `sku`, `short_description`, `description`, `brand`, `product_type`, `condition_type`, `status`, `weight_grams`, `requires_shipping`, `published_at`, `created_at`, `updated_at`) VALUES (66,'d56748ec-c97d-11f1-acfb-00155d32a60c',2,38,'AI Transformation Consulting','ai-transformation-consulting','DIGI-AI-CONS-01','Konsultasi transformasi AI untuk bisnis ÔÇö readiness assessment, roadmap, strategi implementasi.','Konsultasi transformasi AI untuk bisnis. Meliputi AI readiness assessment, roadmap AI, dan strategi implementasi. Dipandu oleh AI Transformation Leader dengan pengalaman membangun DigiAI, SerenityEWS, dan Serenitytrade.',NULL,'service','new','active',0,0,'2026-10-16 23:22:51','2026-10-16 16:22:51','2026-10-16 16:22:51'),(69,'d56b3259-c97d-11f1-acfb-00155d32a60c',2,38,'AI/ML Engineering','ai-ml-engineering','DIGI-AI-ML-01','Implementasi solusi AI/ML: Generative AI, RAG, AI Agents, Computer Vision, Prediction.','Implementasi solusi AI/ML: Generative AI, RAG & AI Agents, Computer Vision, Prediction & Recommendation, Intelligent Automation, Decision Support. Menggunakan OpenAI, LangChain, TensorFlow.',NULL,'service','new','active',0,0,'2026-10-16 23:22:51','2026-10-16 16:22:51','2026-10-16 16:22:51'),(70,'d56b68ae-c97d-11f1-acfb-00155d32a60c',2,39,'Digital Architecture & Strategy','digital-architecture-strategy','DIGI-ARCH-01','Perancangan arsitektur digital modern: Strategy ÔåÆ Architecture ÔåÆ Engineering ÔåÆ Product.','Perancangan arsitektur digital modern (Strategy ÔåÆ Architecture ÔåÆ Engineering ÔåÆ Product). Meliputi Web/Mobile, API Gateway, Domain Services, AI Services, Data Layer.',NULL,'service','new','active',0,0,'2026-10-16 23:22:51','2026-10-16 16:22:51','2026-10-16 16:22:51'),(68,'d56b069b-c97d-11f1-acfb-00155d32a60c',2,38,'Mobile App Development','mobile-app-development','DIGI-MOB-DEV-01','Pengembangan aplikasi mobile cross-platform (Flutter, React Native) untuk Android & iOS.','Pengembangan aplikasi mobile cross-platform (Flutter, React Native) untuk Android & iOS. Termasuk UI/UX design, integrasi API, testing, dan deployment ke store.',NULL,'service','new','active',0,0,'2026-10-16 23:22:51','2026-10-16 16:22:51','2026-10-16 16:22:51'),(71,'d56b9194-c97d-11f1-acfb-00155d32a60c',2,39,'AI/Data Platform Integration','ai-data-platform-integration','DIGI-PLATFORM-01','Integrasi AI & data platform: API, data pipeline, RAG system, AI agents.','Integrasi AI & data platform untuk bisnis. Meliputi API integration, data pipeline, RAG system, AI agents, dan decision support systems.',NULL,'service','new','active',0,0,'2026-10-16 23:22:51','2026-10-16 16:22:51','2026-10-16 16:22:51'),(67,'d5698bea-c97d-11f1-acfb-00155d32a60c',2,38,'Custom Software Development','custom-software-development','DIGI-SW-DEV-01','Pengembangan software custom (web, backend, full-stack) dengan teknologi modern.','Pengembangan software custom (web, backend, full-stack) dengan teknologi modern. Spesialis di TypeScript, Go, Python. Portofolio: DigiAI, SerenityEWS, Serenitytrade, VisionAsk, DataNexus, AgroHub.',NULL,'service','new','active',0,0,'2026-10-16 23:22:51','2026-10-16 16:22:51','2026-10-16 16:22:51');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-16 23:36:51
