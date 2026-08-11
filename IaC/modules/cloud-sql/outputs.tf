output "instance_connection_name" {
  description = "For the Cloud SQL Auth Proxy / connector, format PROJECT:REGION:INSTANCE."
  value       = google_sql_database_instance.this.connection_name
}

output "private_ip_address" {
  value = google_sql_database_instance.this.private_ip_address
}

output "database_name" {
  value = google_sql_database.app.name
}
