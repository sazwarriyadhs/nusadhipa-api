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
-- Dumping data for table `businesses`
--
-- WHERE:  id=2

/*!40000 ALTER TABLE `businesses` DISABLE KEYS */;
INSERT INTO `businesses` (`id`, `public_id`, `owner_user_id`, `business_name`, `legal_name`, `slug`, `business_type`, `description`, `logo_url`, `banner_url`, `email`, `phone`, `province`, `city`, `address`, `nib`, `tax_number`, `kbli_code`, `kbli_name`, `verification_status`, `status`, `created_at`, `updated_at`, `latitude`, `longitude`, `delivery_radius_km`) VALUES (2,'208d40df-c97b-11f1-acfb-00155d32a60c',2,'PT DIGI MEDIA KOMUNIKA','PT DIGI MEDIA KOMUNIKA','pt-digi-media-komunika','umkm','Perusahaan teknologi informasi yang bergerak di bidang Aktivitas Teknologi Informasi dan Jasa Komputer Lainnya. Menyediakan jasa pengembangan software, konsultasi IT, integrasi sistem, dan managed IT services. (KBLI NIB: 62090, setara KBLI 2025: 62900)','/uploads/business-logos/logo_digi.png',NULL,'ptdigimedia@gmail.com','08131771755','Jawa Barat','Kota Bogor','Cimahpar Stoneyard No E1 Jl Guru Muchtar, Cimahpar, Bogor Utara, Kota Bogor, Jawa Barat','2203230003021',NULL,'62900','AKTIVITAS JASA TEKNOLOGI INFORMASI DAN KOMPUTER LAINNYA','verified','active','2026-10-16 16:03:28','2026-10-16 16:17:08',NULL,NULL,5.00);
/*!40000 ALTER TABLE `businesses` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-16 23:36:50
