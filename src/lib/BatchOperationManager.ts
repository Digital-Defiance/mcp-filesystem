/**
 * Batch operation manager implementation
 */

import * as fs from "fs";
import * as path from "path";
import {
  IBatchOperationManager,
  BatchOperation,
  BatchOperationResult,
} from "../interfaces/IBatchOperationManager";
import { ISecurityManager } from "../interfaces/ISecurityManager";
import { FileSystemError } from "../types";

interface RollbackInfo {
  operation: BatchOperation;
  backupPath?: string;
  wasCreated?: boolean;
}

export class BatchOperationManager implements IBatchOperationManager {
  private securityManager: ISecurityManager;

  constructor(securityManager: ISecurityManager) {
    this.securityManager = securityManager;
  }

  async executeBatch(
    operations: BatchOperation[],
    atomic: boolean
  ): Promise<BatchOperationResult[]> {
    const results: BatchOperationResult[] = [];
    const rollbackInfo: RollbackInfo[] = [];

    try {
      // In atomic mode, validate all operations upfront
      if (atomic) {
        await this.validateAllOperations(operations);
      }

      // Execute operations one by one
      for (const operation of operations) {
        try {
          // In non-atomic mode, validate each operation individually
          if (!atomic) {
            await this.validateSingleOperation(operation);
          }

          const rollback = await this.executeOperation(operation);
          rollbackInfo.push({ operation, ...rollback });

          results.push({
            operation,
            success: true,
          });

          // Audit successful operation
          this.securityManager.auditOperation(
            `batch_${operation.type}`,
            [operation.source, operation.destination || ""].filter(Boolean),
            "success"
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          results.push({
            operation,
            success: false,
            error: errorMessage,
          });

          // Audit failed operation
          this.securityManager.auditOperation(
            `batch_${operation.type}`,
            [operation.source, operation.destination || ""].filter(Boolean),
            `failed: ${errorMessage}`
          );

          // If atomic mode, rollback and throw
          if (atomic) {
            await this.rollbackOperations(rollbackInfo);
            throw new FileSystemError(
              `Batch operation failed atomically: ${errorMessage}`
            );
          }
        }
      }

      return results;
    } catch (error) {
      // If we're here in atomic mode, rollback has already happened
      throw error;
    }
  }

  async rollback(completed: BatchOperation[]): Promise<void> {
    // This is a simplified rollback that doesn't have backup info
    // It's mainly for external callers who want to manually rollback
    const rollbackInfo: RollbackInfo[] = completed.map((op) => ({
      operation: op,
    }));
    await this.rollbackOperations(rollbackInfo);
  }

  private async validateSingleOperation(
    operation: BatchOperation
  ): Promise<void> {
    // Validate source path
    const validatedSource = this.securityManager.validatePath(
      operation.source,
      operation.type === "delete" ? "delete" : "read"
    );

    // Check source exists for copy and move operations
    if (operation.type !== "delete") {
      if (!fs.existsSync(validatedSource)) {
        throw new FileSystemError(
          `Source path does not exist: ${operation.source}`
        );
      }

      // Get file size and validate
      const stats = fs.statSync(validatedSource);
      if (stats.isFile()) {
        this.securityManager.validateFileSize(stats.size);
      } else if (stats.isDirectory()) {
        // Calculate directory size recursively
        const dirSize = await this.calculateDirectorySize(validatedSource);
        this.securityManager.validateFileSize(dirSize);
      }
    }

    // Validate destination path for copy and move operations
    if (operation.destination) {
      this.securityManager.validatePath(operation.destination, "write");
    } else if (operation.type !== "delete") {
      throw new FileSystemError(
        `Destination required for ${operation.type} operation`
      );
    }
  }

  private async validateAllOperations(
    operations: BatchOperation[]
  ): Promise<void> {
    let totalSize = 0;

    for (const operation of operations) {
      // Validate source path
      const validatedSource = this.securityManager.validatePath(
        operation.source,
        operation.type === "delete" ? "delete" : "read"
      );

      // Check source exists for copy and move operations
      if (operation.type !== "delete") {
        if (!fs.existsSync(validatedSource)) {
          throw new FileSystemError(
            `Source path does not exist: ${operation.source}`
          );
        }

        // Get file size and validate
        const stats = fs.statSync(validatedSource);
        if (stats.isFile()) {
          this.securityManager.validateFileSize(stats.size);
          totalSize += stats.size;
        } else if (stats.isDirectory()) {
          // Calculate directory size recursively
          const dirSize = await this.calculateDirectorySize(validatedSource);
          totalSize += dirSize;
        }
      }

      // Validate destination path for copy and move operations
      if (operation.destination) {
        this.securityManager.validatePath(operation.destination, "write");
      } else if (operation.type !== "delete") {
        throw new FileSystemError(
          `Destination required for ${operation.type} operation`
        );
      }
    }

    // Validate total batch size
    this.securityManager.validateBatchSize(totalSize, operations.length);
  }

  private async executeOperation(
    operation: BatchOperation
  ): Promise<Partial<RollbackInfo>> {
    const validatedSource = this.securityManager.validatePath(
      operation.source,
      operation.type === "delete" ? "delete" : "read"
    );

    switch (operation.type) {
      case "copy":
        return await this.executeCopy(validatedSource, operation.destination!);

      case "move":
        return await this.executeMove(validatedSource, operation.destination!);

      case "delete":
        return await this.executeDelete(validatedSource);

      default:
        throw new FileSystemError(
          `Unknown operation type: ${(operation as any).type}`
        );
    }
  }

  private async executeCopy(
    source: string,
    destination: string
  ): Promise<Partial<RollbackInfo>> {
    const validatedDest = this.securityManager.validatePath(
      destination,
      "write"
    );

    // Verify source still exists (it should have been validated already)
    if (!fs.existsSync(source)) {
      throw new FileSystemError(
        `Source file disappeared before copy: ${source}`
      );
    }

    // Check if destination already exists
    const destExists = fs.existsSync(validatedDest);

    // Create parent directory if needed
    const destDir = path.dirname(validatedDest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy file or directory
    const stats = fs.statSync(source);
    if (stats.isDirectory()) {
      await this.copyDirectory(source, validatedDest);
    } else {
      fs.copyFileSync(source, validatedDest);
    }

    return {
      wasCreated: !destExists,
    };
  }

  private async executeMove(
    source: string,
    destination: string
  ): Promise<Partial<RollbackInfo>> {
    const validatedDest = this.securityManager.validatePath(
      destination,
      "write"
    );

    // Check if destination already exists
    const destExists = fs.existsSync(validatedDest);

    // Create backup of destination if it exists
    let backupPath: string | undefined;
    if (destExists) {
      backupPath = `${validatedDest}.backup-${Date.now()}`;
      fs.renameSync(validatedDest, backupPath);
    }

    // Create parent directory if needed
    const destDir = path.dirname(validatedDest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Move the file/directory
    fs.renameSync(source, validatedDest);

    return {
      backupPath,
      wasCreated: !destExists,
    };
  }

  private async executeDelete(source: string): Promise<Partial<RollbackInfo>> {
    // Create backup before deletion
    const backupPath = `${source}.backup-${Date.now()}`;

    // Move to backup location instead of immediate deletion
    fs.renameSync(source, backupPath);

    return {
      backupPath,
    };
  }

  private async rollbackOperations(
    rollbackInfo: RollbackInfo[]
  ): Promise<void> {
    // Rollback in reverse order
    for (let i = rollbackInfo.length - 1; i >= 0; i--) {
      const info = rollbackInfo[i];

      try {
        await this.rollbackSingleOperation(info);
      } catch (error) {
        // Log rollback failure but continue with other rollbacks
        console.error(
          `Failed to rollback operation ${info.operation.type}:`,
          error
        );
      }
    }
  }

  private async rollbackSingleOperation(info: RollbackInfo): Promise<void> {
    const { operation, backupPath, wasCreated } = info;

    switch (operation.type) {
      case "copy":
        // Remove the copied file/directory if it was created
        if (wasCreated && operation.destination) {
          const validatedDest = this.securityManager.validatePath(
            operation.destination,
            "delete"
          );
          if (fs.existsSync(validatedDest)) {
            const stats = fs.statSync(validatedDest);
            if (stats.isDirectory()) {
              fs.rmSync(validatedDest, { recursive: true, force: true });
            } else {
              fs.unlinkSync(validatedDest);
            }
          }
        }
        break;

      case "move":
        // Restore from backup and move back to original location
        if (backupPath && fs.existsSync(backupPath)) {
          const validatedDest = this.securityManager.validatePath(
            operation.destination!,
            "delete"
          );

          // Remove the moved file if it exists
          if (fs.existsSync(validatedDest)) {
            const stats = fs.statSync(validatedDest);
            if (stats.isDirectory()) {
              fs.rmSync(validatedDest, { recursive: true, force: true });
            } else {
              fs.unlinkSync(validatedDest);
            }
          }

          // Restore backup to destination
          fs.renameSync(backupPath, validatedDest);
        }

        // Move destination back to source
        if (operation.destination) {
          const validatedDest = this.securityManager.validatePath(
            operation.destination,
            "read"
          );
          const validatedSource = this.securityManager.validatePath(
            operation.source,
            "write"
          );

          if (fs.existsSync(validatedDest)) {
            fs.renameSync(validatedDest, validatedSource);
          }
        }
        break;

      case "delete":
        // Restore from backup
        if (backupPath && fs.existsSync(backupPath)) {
          const validatedSource = this.securityManager.validatePath(
            operation.source,
            "write"
          );
          fs.renameSync(backupPath, validatedSource);
        }
        break;
    }
  }

  private async copyDirectory(
    source: string,
    destination: string
  ): Promise<void> {
    // Create destination directory
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Read directory contents
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await this.calculateDirectorySize(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }
}
