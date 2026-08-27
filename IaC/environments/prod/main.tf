// Thin root module — wires the shared modules together with prod sizing.
// Deployed exclusively via the prod- tag release flow (section 7.4/7.5).

locals {
  environment = "prod"

  # Computed independently of the cloud-run module calls below (not read from
  # their outputs) specifically to avoid a networking <-> cloud-run cycle:
  # the LB's NEGs need these names before the services necessarily exist yet,
  # and the cloud-run module builds the exact same name internally from
  # (service_name, environment) — see modules/cloud-run/main.tf.
  trpc_service_name    = "trpc-api-${local.environment}"
  web_app_service_name = "web-app-${local.environment}"
}

module "networking" {
  source = "../../modules/networking"

  project_id      = var.project_id
  region          = var.region
  environment     = local.environment
  domain          = var.domain
  manage_dns_zone = true # prod owns the apex zone

  trpc_cloud_run_service_name    = local.trpc_service_name
  web_app_cloud_run_service_name = local.web_app_service_name
}

module "gke" {
  source = "../../modules/gke-autopilot"

  project_id                    = var.project_id
  region                        = var.region
  environment                   = local.environment
  network_id                    = module.networking.vpc_id
  subnetwork_id                 = module.networking.public_subnet_id
  pods_secondary_range_name     = module.networking.pods_secondary_range_name
  services_secondary_range_name = module.networking.services_secondary_range_name
  release_channel               = "STABLE"
}

# Pre-created here (rather than left to modules/cloud-run to create
# internally) for trpc-api and moderation-service specifically, because other
# resources below need to reference each one's identity and the two Cloud Run
# services need to reference *each other's* — trpc-api calls
# moderation-service's URL, moderation-service authorizes trpc-api's SA as
# its only invoker. Creating both SAs as plain root resources first breaks
# what would otherwise be a module-to-module cycle. web-app doesn't have this
# problem, so it just uses modules/cloud-run's auto-created SA.
resource "google_service_account" "trpc_api" {
  project      = var.project_id
  account_id   = "trpc-api-${local.environment}"
  display_name = "tRPC API (${local.environment})"
}

resource "google_service_account" "moderation_service" {
  project      = var.project_id
  account_id   = "moderation-svc-${local.environment}"
  display_name = "Moderation service (${local.environment})"
}

# Same reasoning as trpc-api/moderation-service above: the WebSocket service
# isn't a Cloud Run service at all (modules/cloud-run doesn't apply to it) —
# it's a GKE workload, deployed by the web-app repo's own pipeline via a
# Kubernetes Service Account bound to this GSA through Workload Identity
# (that binding is an app-repo concern; the GSA and its IAM grants are an
# infra concern, so they live here).
resource "google_service_account" "websocket_service" {
  project      = var.project_id
  account_id   = "websocket-service-${local.environment}"
  display_name = "WebSocket service (${local.environment})"
}

module "secrets" {
  source = "../../modules/secrets"

  project_id  = var.project_id
  environment = local.environment

  # The moderation service's config reference is the one secret the tech
  # spec names explicitly (section 3); add more here as real services need
  # them, rather than pre-guessing names nothing reads yet.
  secret_ids = ["moderation-service-config-ref"]

  accessor_bindings = {
    "moderation-service-config-ref" = [
      "serviceAccount:${google_service_account.moderation_service.email}",
    ]
  }
}

module "kms" {
  source = "../../modules/kms"

  project_id  = var.project_id
  region      = var.region
  environment = local.environment

  # trpc-api is the only service that ever encrypts/decrypts user_profiles
  # PII (see services/trpc-api/src/repositories/userProfileRepository.ts)
  # — websocket-service and moderation-service never touch this key.
  encrypter_decrypter_members = [
    "serviceAccount:${google_service_account.trpc_api.email}",
  ]
}

module "trpc_api" {
  source = "../../modules/cloud-run"

  project_id            = var.project_id
  region                = var.region
  environment           = local.environment
  service_name          = "trpc-api"
  image                 = coalesce(var.trpc_image, var.placeholder_image)
  service_account_email = google_service_account.trpc_api.email

  min_instances = 0
  max_instances = 20

  ingress               = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  vpc_connector_id      = module.networking.vpc_connector_id
  vpc_egress            = "PRIVATE_RANGES_ONLY" # still needs public internet (e.g. OAuth providers)
  allow_unauthenticated = true                  # network ingress is already LB-restricted; this just permits the LB itself to invoke it

  env_vars = {
    REDIS_HOST         = module.redis.host
    REDIS_PORT         = tostring(module.redis.port)
    DB_INSTANCE        = module.cloud_sql.instance_connection_name
    DB_NAME            = module.cloud_sql.database_name
    MODERATION_SVC_URL = module.moderation_service.uri
    KMS_PROVIDER       = "gcp"
    KMS_KEY_NAME       = module.kms.key_name
  }
}

module "web_app" {
  source = "../../modules/cloud-run"

  project_id   = var.project_id
  region       = var.region
  environment  = local.environment
  service_name = "web-app"
  image        = coalesce(var.web_app_image, var.placeholder_image)

  min_instances = 1 # SSR (section 10.1) — avoid cold-start on first paint
  max_instances = 20

  ingress               = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  vpc_connector_id      = module.networking.vpc_connector_id
  vpc_egress            = "PRIVATE_RANGES_ONLY"
  allow_unauthenticated = true

  env_vars = {
    REDIS_HOST  = module.redis.host
    REDIS_PORT  = tostring(module.redis.port)
    DB_INSTANCE = module.cloud_sql.instance_connection_name
    DB_NAME     = module.cloud_sql.database_name
    TRPC_URL    = "https://trpc.${var.domain}"
  }
}

module "moderation_service" {
  source = "../../modules/cloud-run"

  project_id            = var.project_id
  region                = var.region
  environment           = local.environment
  service_name          = "moderation-service"
  image                 = coalesce(var.moderation_service_image, var.placeholder_image)
  service_account_email = google_service_account.moderation_service.email

  min_instances = 0
  max_instances = 10

  # Never public, not even via the LB — reached only by the tRPC API, over
  # gRPC, through the VPC connector (section 6.2).
  ingress               = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  vpc_connector_id      = module.networking.vpc_connector_id
  vpc_egress            = "ALL_TRAFFIC" # its only path out is Cloud NAT, not a direct public IP
  allow_unauthenticated = false
  invoker_members       = ["serviceAccount:${google_service_account.trpc_api.email}"]
}

module "cloud_sql" {
  source = "../../modules/cloud-sql"

  project_id             = var.project_id
  region                 = var.region
  environment            = local.environment
  network_id             = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
  availability_type      = "REGIONAL" # HA in prod
  tier                   = "db-custom-2-7680"
  deletion_protection    = true

  iam_service_accounts = [
    google_service_account.trpc_api.email,
    google_service_account.websocket_service.email,
  ]
}

module "redis" {
  source = "../../modules/redis"

  project_id      = var.project_id
  region          = var.region
  environment     = local.environment
  use_memorystore = false # self-hosted per section 8.3's cost analysis

  storage_size = "20Gi"
}
