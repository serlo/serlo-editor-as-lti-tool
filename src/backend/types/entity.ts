export interface Entity {
  id: number
  iss: string
  resource_link_id?: string
  custom_claim_id?: string
  edusharing_node_id?: string
  content: string
  user_when_first_opened: string
  id_token_when_first_opened: string
  id_token_when_created?: string
}
