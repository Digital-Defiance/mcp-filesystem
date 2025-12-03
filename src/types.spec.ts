/**
 * Basic test to verify test infrastructure
 */

import { SecurityError, ValidationError, FileSystemError } from "./types";

describe("Error Types", () => {
  it("should create SecurityError", () => {
    const error = new SecurityError("test message");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SecurityError);
    expect(error.name).toBe("SecurityError");
    expect(error.message).toBe("test message");
  });

  it("should create ValidationError", () => {
    const error = new ValidationError("test message");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe("ValidationError");
    expect(error.message).toBe("test message");
  });

  it("should create FileSystemError", () => {
    const error = new FileSystemError("test message");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FileSystemError);
    expect(error.name).toBe("FileSystemError");
    expect(error.message).toBe("test message");
  });
});
