CREATE TABLE IF NOT EXISTS lti_entity (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  content JSON DEFAULT NULL,
  lti_platform VARCHAR(255) NOT NULL,
  lti_resource_link_id VARCHAR(255) NOT NULL,
  lti_custom_claim_id VARCHAR(255) DEFAULT NULL,
  lti_user_when_first_opened VARCHAR(255) NOT NULL,
  lti_user_when_created VARCHAR(255) DEFAULT NULL,
  edusharing_node_id VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY idx_lti_entity_iss_resource_link_id (lti_platform, lti_resource_link_id)
);