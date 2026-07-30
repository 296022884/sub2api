package service

import (
	"context"
	"errors"
)

// AvailableOpenAIImageModelIDs intersects a server-owned image model catalog
// with the same schedulable account/model policy used by OpenAI routing.
func (s *OpenAIGatewayService) AvailableOpenAIImageModelIDs(
	ctx context.Context,
	groupID *int64,
	candidateIDs []string,
) ([]string, error) {
	if s == nil || s.accountRepo == nil || groupID == nil {
		return nil, errors.New("image model availability is unavailable")
	}
	accounts, err := s.listSchedulableAccounts(ctx, groupID, PlatformOpenAI)
	if err != nil {
		return nil, err
	}

	available := make([]string, 0, len(candidateIDs))
	for _, modelID := range candidateIDs {
		for i := range accounts {
			account := &accounts[i]
			if !isOpenAICompatibleAccountEligibleForRequest(ctx, account, PlatformOpenAI, modelID, false, "") {
				continue
			}
			if !accountSupportsOpenAICapabilities(account, "", OpenAIImagesCapabilityNative) &&
				!accountSupportsOpenAICapabilities(account, "", OpenAIImagesCapabilityBasic) {
				continue
			}
			available = append(available, modelID)
			break
		}
	}
	return available, nil
}
