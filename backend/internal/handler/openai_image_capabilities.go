package handler

import (
	"net/http"
	"slices"

	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type imageStudioEnumCapability struct {
	Values  []string `json:"values"`
	Default string   `json:"default"`
}

type imageStudioParameters struct {
	Size         imageStudioEnumCapability `json:"size"`
	Quality      imageStudioEnumCapability `json:"quality"`
	OutputFormat imageStudioEnumCapability `json:"output_format"`
}

type imageStudioModelCapability struct {
	ID         string                `json:"id"`
	Operations []string              `json:"operations"`
	Parameters imageStudioParameters `json:"parameters"`
}

type imageStudioUploadCapability struct {
	MIMETypes     []string `json:"mime_types"`
	MaxFiles      int      `json:"max_files"`
	MaxFileBytes  int64    `json:"max_file_bytes"`
	MaxTotalBytes int64    `json:"max_total_bytes"`
}

type imageStudioCapabilitiesResponse struct {
	Operations []string                     `json:"operations"`
	Models     []imageStudioModelCapability `json:"models"`
	Uploads    imageStudioUploadCapability  `json:"uploads"`
}

var imageStudioOpenAIModels = []imageStudioModelCapability{
	{
		ID:         "gpt-image-2",
		Operations: []string{"generate", "edit"},
		Parameters: imageStudioParameters{
			Size: imageStudioEnumCapability{
				Values:  []string{"auto", "1024x1024", "1536x1024", "1024x1536", "2048x1152", "2048x2048"},
				Default: "auto",
			},
			Quality: imageStudioEnumCapability{
				Values:  []string{"auto", "low", "medium", "high"},
				Default: "auto",
			},
			OutputFormat: imageStudioEnumCapability{
				Values:  []string{"png", "jpeg", "webp"},
				Default: "png",
			},
		},
	},
}

// Keep the advertised preflight limit at or below the gateway's multipart
// upload-part reader limit so accepted files cannot be truncated in transit.
const imageStudioMaxUploadPartBytes = 20 * 1024 * 1024

// ImageCapabilities returns the fail-closed Image Studio contract for the
// authenticated OpenAI key. It never serializes the key itself.
func (h *OpenAIGatewayHandler) ImageCapabilities(c *gin.Context) {
	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok || apiKey.Group == nil {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	group := apiKey.Group
	if group.Platform != service.PlatformOpenAI || !service.GroupAllowsImageGeneration(group) {
		h.errorResponse(c, http.StatusForbidden, "permission_error", service.ImageGenerationPermissionMessage())
		return
	}

	candidates := make([]imageStudioModelCapability, 0, len(imageStudioOpenAIModels))
	for _, model := range imageStudioOpenAIModels {
		if group.CustomModelsListEnabled() && !slices.Contains(group.ModelsListConfig.Models, model.ID) {
			continue
		}
		candidates = append(candidates, model)
	}
	candidateIDs := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		candidateIDs = append(candidateIDs, candidate.ID)
	}
	availableIDs, err := h.gatewayService.AvailableOpenAIImageModelIDs(c.Request.Context(), apiKey.GroupID, candidateIDs)
	if err != nil {
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Image capabilities are unavailable")
		return
	}
	models := make([]imageStudioModelCapability, 0, len(availableIDs))
	operations := make([]string, 0, 2)
	for _, candidate := range candidates {
		if slices.Contains(availableIDs, candidate.ID) {
			models = append(models, candidate)
			for _, operation := range candidate.Operations {
				if !slices.Contains(operations, operation) {
					operations = append(operations, operation)
				}
			}
		}
	}

	c.JSON(http.StatusOK, imageStudioCapabilitiesResponse{
		Operations: operations,
		Models:     models,
		Uploads: imageStudioUploadCapability{
			MIMETypes:     []string{"image/png", "image/jpeg", "image/webp"},
			MaxFiles:      1,
			MaxFileBytes:  imageStudioMaxUploadPartBytes,
			MaxTotalBytes: imageStudioMaxUploadPartBytes,
		},
	})
}
