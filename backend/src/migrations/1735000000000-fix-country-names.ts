import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCountryNames1735000000000 implements MigrationInterface {
  name = 'FixCountryNames1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration fixes geoCountryName values that are country codes instead of full names
    // It uses a JavaScript function to convert codes to names using Intl.DisplayNames
    
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    
    // Get all records with geoCountry set
    const records = await queryRunner.query(`
      SELECT id, "geoCountry", "geoCountryName" 
      FROM dmarc_records 
      WHERE "geoCountry" IS NOT NULL
    `);

    console.log(`Found ${records.length} records with geoCountry data`);

    // Update records where geoCountryName is missing or is a 2-letter code
    let updatedCount = 0;
    for (const record of records) {
      const countryCode = record.geoCountry;
      const currentName = record.geoCountryName;
      
      // Check if name is missing or is a 2-letter code (likely just the country code)
      const needsUpdate = !currentName || (currentName.length === 2 && currentName === currentName.toUpperCase());
      
      if (needsUpdate) {
        try {
          const properName = regionNames.of(countryCode.toUpperCase());
          if (properName && properName !== countryCode) {
            await queryRunner.query(
              `UPDATE dmarc_records SET "geoCountryName" = $1 WHERE id = $2`,
              [properName, record.id]
            );
            updatedCount++;
          }
        } catch (error) {
          console.warn(`Could not convert country code ${countryCode} for record ${record.id}`);
        }
      }
    }

    console.log(`Updated ${updatedCount} records with proper country names`);

    // Also fix ip_locations table
    const locations = await queryRunner.query(`
      SELECT id, country, "countryName" 
      FROM ip_locations 
      WHERE country IS NOT NULL
    `);

    console.log(`Found ${locations.length} IP locations with country data`);

    let locationsUpdatedCount = 0;
    for (const location of locations) {
      const countryCode = location.country;
      const currentName = location.countryName;
      
      // Check if name is missing or is a 2-letter code
      const needsUpdate = !currentName || (currentName.length === 2 && currentName === currentName.toUpperCase());
      
      if (needsUpdate) {
        try {
          const properName = regionNames.of(countryCode.toUpperCase());
          if (properName && properName !== countryCode) {
            await queryRunner.query(
              `UPDATE ip_locations SET "countryName" = $1 WHERE id = $2`,
              [properName, location.id]
            );
            locationsUpdatedCount++;
          }
        } catch (error) {
          console.warn(`Could not convert country code ${countryCode} for location ${location.id}`);
        }
      }
    }

    console.log(`Updated ${locationsUpdatedCount} IP locations with proper country names`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No need to revert - the data is more correct after this migration
    // If needed, you could set geoCountryName back to geoCountry values
    console.log('Skipping rollback - country names are more correct after migration');
  }
}
