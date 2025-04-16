CREATE TABLE IF NOT EXISTS lti_entity (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `iss` varchar(255) NOT NULL,
  `resource_link_id` varchar(255) NOT NULL,
  `custom_claim_id` varchar(255) DEFAULT NULL,
  `edusharing_node_id` varchar(255) DEFAULT NULL,
  `content` longtext DEFAULT NULL,
  `user_when_first_opened` varchar(255) NOT NULL,
  `id_token_when_first_opened` text NOT NULL,
  `id_token_when_created` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lti_entity_custom_claim_id` (`custom_claim_id`),
  KEY `idx_lti_entity_edusharing_node_id` (`edusharing_node_id`),
  KEY `idx_lti_entity_iss` (`iss`)
);