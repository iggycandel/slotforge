import type { Database } from './types/database'

// Test if Database['public'] extends GenericSchema
type TestSchema = Database['public']
type PublicTables = TestSchema['Tables']
type ProjectsTable = PublicTables['projects']
type ProjectRow = ProjectsTable['Row']

// Force a type check
const _id: string = (undefined as unknown as ProjectRow).id
