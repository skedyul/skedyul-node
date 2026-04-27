// CRM Schema exports
export {
  // Zod schemas
  CRMFieldTypeSchema,
  CRMFieldRequirementSchema,
  CRMFieldOptionSchema,
  CRMFieldDefinitionSchema,
  CRMFieldSchemaZ,
  CRMModelSchemaZ,
  CRMCardinalitySchema,
  CRMOnDeleteSchema,
  CRMRelationshipLinkSchema,
  CRMRelationshipSchemaZ,
  CRMSchemaZ,
  // Types
  type CRMFieldType,
  type CRMFieldRequirement,
  type CRMFieldOption,
  type CRMFieldDefinition,
  type CRMFieldSchema,
  type CRMModelSchema,
  type CRMCardinality,
  type CRMOnDelete,
  type CRMRelationshipLink,
  type CRMRelationshipSchema,
  type CRMSchema,
  type CRMSchemaValidationResult,
  // Functions
  defineSchema,
  validateCRMSchema,
  parseCRMSchema,
  safeParseCRMSchema,
} from './crm-schema'
